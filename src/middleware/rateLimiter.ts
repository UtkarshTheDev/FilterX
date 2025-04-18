import type { Request, Response, NextFunction } from "express";
import { redisClient } from "../utils/redis";
import { config } from "../config";
import { AppError } from "./errorHandler";

/**
 * Create a Redis-based rate limiter
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
      // Use IP if no userId (pre-auth) or userId if authenticated
      const identifier = req.userId || req.ip;
      const key = `${prefix}:${identifier}`;

      // Get the current count
      const currentCount = await redisClient.incr(key);

      // Set expiry on first request
      if (currentCount === 1) {
        await redisClient.expire(key, Math.ceil(windowMs / 1000));
      }

      // Get the TTL for the retry header
      const ttl = await redisClient.ttl(key);

      // Set headers
      res.setHeader("X-RateLimit-Limit", limit);
      res.setHeader("X-RateLimit-Remaining", Math.max(0, limit - currentCount));

      // If over limit, send error
      if (currentCount > limit) {
        // Set retry header (in seconds)
        res.setHeader("Retry-After", ttl);
        throw new AppError("Rate limit exceeded. Try again later.", 429);
      }

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
