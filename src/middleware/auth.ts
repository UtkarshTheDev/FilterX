import type { Request, Response, NextFunction } from "express";
import { validateApiKey } from "../services/apiKeyService";
import { AppError } from "./errorHandler";

// Add custom properties to the Request type
declare global {
  namespace Express {
    interface Request {
      apiKey?: any;
      userId?: string;
    }
  }
}

/**
 * Local memory cache for API keys to avoid even Redis lookups
 * This dramatically reduces authentication overhead
 */
const localKeyCache: Map<string, { apiKey: any; expires: number }> = new Map();

// Cache expiry time in milliseconds (2 minutes)
const CACHE_EXPIRY = 2 * 60 * 1000;

// Cleanup interval for the local cache (run every 5 minutes)
setInterval(() => {
  const now = Date.now();
  let expired = 0;
  for (const [key, value] of localKeyCache.entries()) {
    if (value.expires < now) {
      localKeyCache.delete(key);
      expired++;
    }
  }
  if (expired > 0) {
    console.debug(`Cleaned up ${expired} expired API keys from local cache`);
  }
}, 5 * 60 * 1000);

/**
 * Extract API key from request
 * @param req Express request
 * @returns API key string
 */
const extractApiKey = (req: Request): string | null => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7); // Remove 'Bearer ' prefix
  }

  if (req.query.apiKey) {
    return req.query.apiKey as string;
  }

  return null;
};

/**
 * API key authentication middleware - optimized for maximum speed
 */
export const apiKeyAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Start timing for performance monitoring
  const startTime = performance.now();

  try {
    const apiKey = extractApiKey(req);

    if (!apiKey) {
      throw new AppError("API key is required", 401);
    }

    // Check local memory cache first (ultra fast)
    const cachedKey = localKeyCache.get(apiKey);
    if (cachedKey && cachedKey.expires > Date.now()) {
      // Use cached API key data
      req.apiKey = cachedKey.apiKey;
      req.userId = cachedKey.apiKey.userId;

      // Log performance in background
      setImmediate(() => {
        const duration = Math.round(performance.now() - startTime);
        console.debug(`API key validated from local cache in ${duration}ms`);
      });

      return next();
    }

    // If not in local cache, validate through service
    const validApiKey = await validateApiKey(apiKey);

    if (!validApiKey) {
      throw new AppError("Invalid API key", 401);
    }

    // Attach API key and userId to request
    req.apiKey = validApiKey;
    req.userId = validApiKey.userId;

    // Update local cache in background
    setImmediate(() => {
      localKeyCache.set(apiKey, {
        apiKey: validApiKey,
        expires: Date.now() + CACHE_EXPIRY,
      });
    });

    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
    } else {
      next(new AppError("Authentication failed", 401));
    }
  }
};
