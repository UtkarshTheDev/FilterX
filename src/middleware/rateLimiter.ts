import type { Request, Response, NextFunction } from "express";
import { redisClient } from "../utils/redis";
import { config } from "../config";
import { AppError } from "./errorHandler";

// PHASE 1 OPTIMIZATION: Enhanced local cache with circuit breaker
interface RateLimitCacheEntry {
  count: number;
  expires: number;
  lastRedisSync: number; // Track when we last synced with Redis
}

// Circuit breaker for Redis failures
interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
}

// In-memory cache for rate limits (OPTIMIZED: 5-minute TTL, probabilistic sync)
const rateLimitCache: Map<string, RateLimitCacheEntry> = new Map();

// Circuit breaker state for Redis operations
const circuitBreaker: CircuitBreakerState = {
  failures: 0,
  lastFailure: 0,
  isOpen: false,
};

// PHASE 1: Enhanced cleanup with circuit breaker reset
setInterval(() => {
  const now = Date.now();
  let expired = 0;

  // Clean up expired entries
  for (const [key, entry] of rateLimitCache.entries()) {
    if (entry.expires < now) {
      rateLimitCache.delete(key);
      expired++;
    }
  }

  // Reset circuit breaker if enough time has passed (30 seconds)
  if (circuitBreaker.isOpen && now - circuitBreaker.lastFailure > 30000) {
    circuitBreaker.isOpen = false;
    circuitBreaker.failures = 0;
    console.log("[RateLimit] Circuit breaker reset - Redis operations resumed");
  }

  if (expired > 0) {
    console.debug(
      `[RateLimit] Cleaned up ${expired} expired entries, circuit breaker: ${
        circuitBreaker.isOpen ? "OPEN" : "CLOSED"
      }`
    );
  }
}, 60 * 1000);

// PHASE 1: Helper function to handle Redis failures with circuit breaker
const handleRedisFailure = (error: any) => {
  circuitBreaker.failures++;
  circuitBreaker.lastFailure = Date.now();

  // Open circuit breaker after 3 failures
  if (circuitBreaker.failures >= 3) {
    circuitBreaker.isOpen = true;
    console.warn(
      "[RateLimit] Circuit breaker OPENED - Redis operations suspended"
    );
  }

  console.error("[RateLimit] Redis operation failed:", error);
};

// PHASE 1: Probabilistic Redis sync (only sync every 10th request)
const shouldSyncWithRedis = (entry: RateLimitCacheEntry): boolean => {
  const now = Date.now();

  // Always sync if we haven't synced in the last 30 seconds
  if (now - entry.lastRedisSync > 30000) {
    return true;
  }

  // Otherwise, 10% probability of sync
  return Math.random() < 0.1;
};

/**
 * PHASE 1 OPTIMIZED: High-performance rate limiter with enhanced local caching
 * Features: 5-minute local cache, probabilistic Redis sync, circuit breaker
 * @param prefix Key prefix for Redis
 * @param limit Number of requests allowed per window
 * @param windowMs Window size in milliseconds
 * @returns Rate limiter middleware function
 */
export const createRateLimiter = (
  prefix: string,
  limit: number = config.rateLimit.filterRequests,
  windowMs: number = config.rateLimit.windowMs
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Start timing for performance monitoring
      const startTime = performance.now();

      // Use IP if no userId (pre-auth) or userId if authenticated
      const identifier = req.userId || req.ip;
      const key = `${prefix}:${identifier}`;

      // Set headers immediately (can be overwritten later if needed)
      res.setHeader("X-RateLimit-Limit", limit);

      // PHASE 1: Check local cache first (ultra fast, 5-minute TTL)
      const localEntry = rateLimitCache.get(key);
      const now = Date.now();

      if (localEntry && localEntry.expires > now) {
        // We have a valid cached rate limit
        const currentCount = localEntry.count + 1;

        // Update cache immediately with new count
        localEntry.count = currentCount;

        // Set remaining header
        res.setHeader(
          "X-RateLimit-Remaining",
          Math.max(0, limit - currentCount)
        );

        // If over limit, send error
        if (currentCount > limit) {
          const ttl = Math.ceil((localEntry.expires - now) / 1000);
          res.setHeader("Retry-After", ttl);
          throw new AppError("Rate limit exceeded. Try again later.", 429);
        }

        // CRITICAL FIX: Truly non-blocking Redis sync
        if (!circuitBreaker.isOpen && shouldSyncWithRedis(localEntry)) {
          // Fire and forget - completely detached from request processing
          process.nextTick(async () => {
            const syncStartTime = performance.now();
            try {
              await redisClient.incr(key);
              localEntry.lastRedisSync = now;
              const syncDuration = Math.round(
                performance.now() - syncStartTime
              );
              console.debug(
                `[RateLimit] Probabilistic Redis sync completed in ${syncDuration}ms (background)`
              );
            } catch (error) {
              handleRedisFailure(error);
            }
          });
        }

        const duration = Math.round(performance.now() - startTime);
        console.debug(`[RateLimit] Local cache hit completed in ${duration}ms`);
        return next();
      }

      // PHASE 1: Not in local cache - check Redis with circuit breaker
      if (circuitBreaker.isOpen) {
        // Circuit breaker is open - use local-only mode with generous limits
        console.warn(
          "[RateLimit] Circuit breaker OPEN - using local-only mode"
        );

        // Create a temporary local entry with 5-minute TTL
        const tempEntry: RateLimitCacheEntry = {
          count: 1,
          expires: now + 300000, // 5 minutes
          lastRedisSync: 0,
        };

        rateLimitCache.set(key, tempEntry);
        res.setHeader("X-RateLimit-Remaining", Math.max(0, limit - 1));

        const duration = Math.round(performance.now() - startTime);
        console.debug(
          `[RateLimit] Circuit breaker mode completed in ${duration}ms`
        );
        return next();
      }

      try {
        // PHASE 1: Optimized Redis operations with timeout
        const redisTimeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Redis timeout")), 2000)
        );

        const redisOps = Promise.all([
          redisClient.incr(key),
          redisClient.expire(key, Math.ceil(windowMs / 1000), "NX"), // Only set if not exists
          redisClient.ttl(key),
        ]);

        const [currentCount, , ttl] = (await Promise.race([
          redisOps,
          redisTimeout,
        ])) as [number, any, number];

        // PHASE 1: Update local cache with 5-minute TTL (extended from 1 minute)
        const cacheExpiry = now + Math.min(300000, ttl * 1000); // 5 minutes or Redis TTL, whichever is smaller
        rateLimitCache.set(key, {
          count: currentCount,
          expires: cacheExpiry,
          lastRedisSync: now,
        });

        // Set headers
        res.setHeader(
          "X-RateLimit-Remaining",
          Math.max(0, limit - currentCount)
        );

        // If over limit, send error
        if (currentCount > limit) {
          res.setHeader("Retry-After", Math.max(1, ttl));
          throw new AppError("Rate limit exceeded. Try again later.", 429);
        }

        const duration = Math.round(performance.now() - startTime);
        console.debug(`[RateLimit] Redis check completed in ${duration}ms`);
        next();
      } catch (redisError) {
        // PHASE 1: Handle Redis failure gracefully
        handleRedisFailure(redisError);

        // Fallback to local-only mode for this request
        const fallbackEntry: RateLimitCacheEntry = {
          count: 1,
          expires: now + 300000, // 5 minutes
          lastRedisSync: 0,
        };

        rateLimitCache.set(key, fallbackEntry);
        res.setHeader("X-RateLimit-Remaining", Math.max(0, limit - 1));

        const duration = Math.round(performance.now() - startTime);
        console.warn(`[RateLimit] Redis fallback completed in ${duration}ms`);
        next();
      }
    } catch (error) {
      if (error instanceof AppError) {
        next(error);
      } else {
        console.error("[RateLimit] Unexpected error:", error);
        next(new AppError("Failed to check rate limit", 500));
      }
    }
  };
};

// Predefined rate limiters
export const apiKeyRateLimiter = createRateLimiter(
  "rate:apikey",
  config.rateLimit.apiKeyRequests
);

export const filterRateLimiter = createRateLimiter(
  "rate:filter",
  config.rateLimit.filterRequests
);

// Home endpoint rate limiter - more lenient for informational endpoint
export const homeRateLimiter = createRateLimiter(
  "rate:home",
  60, // 60 requests per minute (more lenient than filter endpoints)
  60000 // 1 minute window
);
