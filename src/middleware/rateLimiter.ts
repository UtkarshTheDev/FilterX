import type { Request, Response, NextFunction } from "express";
import { redisClient } from "../utils/redis";
import { config } from "../config";
import { AppError } from "./errorHandler";

// Local memory rate limit cache to avoid Redis calls
interface RateLimitCacheEntry {
  count: number;
  expires: number;
}

// In-memory cache for rate limits (to minimize Redis calls)
const rateLimitCache: Map<string, RateLimitCacheEntry> = new Map();

// Cleanup interval for the local cache (run every minute)
setInterval(() => {
  const now = Date.now();
  let expired = 0;
  for (const [key, entry] of rateLimitCache.entries()) {
    if (entry.expires < now) {
      rateLimitCache.delete(key);
      expired++;
    }
  }
  if (expired > 0) {
    console.debug(
      `Cleaned up ${expired} expired rate limit entries from local cache`
    );
  }
}, 60 * 1000);

/**
 * Create a high-performance rate limiter with local caching
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

      // Check local cache first (ultra fast)
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

        // Update Redis in the background (fire and forget)
        setImmediate(async () => {
          try {
            await redisClient.incr(key);
            const duration = Math.round(performance.now() - startTime);
            console.debug(
              `Rate limit check from local cache completed in ${duration}ms`
            );
          } catch (error) {
            console.error("Background Redis rate limit update failed:", error);
          }
        });

        return next();
      }

      // Not in local cache, need to check Redis
      // Get the current count
      const currentCount = await redisClient.incr(key);

      // Set expiry on first request
      if (currentCount === 1) {
        await redisClient.expire(key, Math.ceil(windowMs / 1000));
      }

      // Get the TTL for the retry header and local caching
      const ttl = await redisClient.ttl(key);

      // Update local cache
      rateLimitCache.set(key, {
        count: currentCount,
        expires: now + ttl * 1000,
      });

      // Set headers
      res.setHeader("X-RateLimit-Remaining", Math.max(0, limit - currentCount));

      // If over limit, send error
      if (currentCount > limit) {
        // Set retry header (in seconds)
        res.setHeader("Retry-After", ttl);
        throw new AppError("Rate limit exceeded. Try again later.", 429);
      }

      // Log performance in background
      setImmediate(() => {
        const duration = Math.round(performance.now() - startTime);
        console.debug(`Rate limit check from Redis completed in ${duration}ms`);
      });

      next();
    } catch (error) {
      if (error instanceof AppError) {
        next(error);
      } else {
        console.error("Rate limiting error:", error);
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
