import express from "express";
import type { RequestHandler } from "express";
import { body } from "express-validator";
import { apiKeyAuth } from "../middleware/auth";
import { filterRateLimiter } from "../middleware/rateLimiter";
import { asyncHandler } from "../middleware/errorHandler";
import { filterController } from "../controllers/filterController";
import { config } from "../config";
import logger from "../utils/logger";

const router = express.Router();

// Route-level in-memory response cache for frequent identical requests
// This allows bypassing all middleware and database access for repeat requests
// dramatically improving response times
interface CacheEntry {
  data: any;
  expiry: number;
}

// Simple LRU cache implementation for route responses
class RouteCache {
  private cache: Map<string, CacheEntry> = new Map();
  private readonly maxSize: number = 500; // Max number of cached responses
  private readonly defaultTTL: number; // Default TTL in milliseconds
  private hitCount: number = 0;
  private missCount: number = 0;

  constructor(defaultTTLSeconds: number = 60) {
    // 1 minute default
    this.defaultTTL = defaultTTLSeconds * 1000;
    logger.info(
      `Initialized route cache with TTL: ${defaultTTLSeconds}s, max size: ${this.maxSize}`
    );

    // Cleanup expired items periodically
    setInterval(() => this.removeExpiredItems(), 60000);
  }

  get(key: string): any {
    const entry = this.cache.get(key);

    // If entry doesn't exist or is expired
    if (!entry || entry.expiry < Date.now()) {
      if (entry) {
        // Remove expired entry
        this.cache.delete(key);
      }
      this.missCount++;
      return null;
    }

    // Move to end of Map for LRU behavior
    this.cache.delete(key);
    this.cache.set(key, entry);

    this.hitCount++;
    return entry.data;
  }

  set(key: string, value: any, ttlMs?: number): void {
    // If at capacity, remove oldest (first) entry
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    const expiryTime = Date.now() + (ttlMs || this.defaultTTL);
    this.cache.set(key, { data: value, expiry: expiryTime });
  }

  private removeExpiredItems(): void {
    const now = Date.now();
    let removedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiry < now) {
        this.cache.delete(key);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      logger.debug(
        `Route cache cleanup: removed ${removedCount} expired entries`
      );
    }
  }

  getStats(): {
    size: number;
    maxSize: number;
    hits: number;
    misses: number;
    hitRate: string;
  } {
    const total = this.hitCount + this.missCount;
    const hitRate =
      total === 0 ? "0%" : `${Math.round((this.hitCount / total) * 100)}%`;

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hitCount,
      misses: this.missCount,
      hitRate,
    };
  }
}

// Create route cache singleton
const routeCache = new RouteCache(config.caching.defaultTTL / 60); // Use configured TTL divided by 60 (convert to seconds)

// Cache middleware generator - creates a middleware that caches responses
const createCacheMiddleware = (ttlSeconds = 60): RequestHandler => {
  return (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ): void => {
    // Skip cache for specific conditions
    if (req.method !== "POST" || req.query.nocache === "true") {
      next();
      return;
    }

    // Create a cache key from the request
    const key = generateCacheKey(req);

    // Check cache
    const cachedResponse = routeCache.get(key);
    if (cachedResponse) {
      logger.debug(`Route cache hit for ${req.originalUrl}`);
      res.json(cachedResponse);
      return;
    }

    // No cache hit, continue to next middleware
    logger.debug(`Route cache miss for ${req.originalUrl}`);

    // Override res.json to cache the response
    const originalJson = res.json;
    res.json = function (body: any): express.Response {
      routeCache.set(key, body, ttlSeconds * 1000);
      return originalJson.call(this, body);
    };

    next();
  };
};

// Generate a cache key from the request
const generateCacheKey = (req: express.Request): string => {
  // Use a hash of the URL, method, body, and API key
  const apiKey =
    req.headers.authorization?.replace("Bearer ", "") || req.query.apiKey || "";

  // For filter requests, we need to normalize the request body
  // to ensure cache hits for functionally identical requests
  const normalizedBody = { ...req.body };

  // Remove non-deterministic parts from body
  if (normalizedBody.oldMessages && Array.isArray(normalizedBody.oldMessages)) {
    // Only use the last 3 messages for cache key to improve hit rate
    normalizedBody.oldMessages = normalizedBody.oldMessages.slice(-3);
  }

  // Create string to hash
  const stringToHash = `${req.originalUrl}|${
    req.method
  }|${apiKey}|${JSON.stringify(normalizedBody)}`;

  // Create simple hash (for speed)
  let hash = 0;
  for (let i = 0; i < stringToHash.length; i++) {
    const char = stringToHash.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  return `route:${hash}`;
};

// Optimized middleware chain - explicit typing as RequestHandler[]
const optimizedMiddleware: RequestHandler[] = [
  // Apply route caching (before rate limiting and auth for maximum speed)
  createCacheMiddleware(),

  // Apply rate limiting next (to reject over-limit requests quickly)
  filterRateLimiter,

  // Apply API key auth last (most expensive operation)
  apiKeyAuth,
];

/**
 * POST /v1/filter
 * Filter content for moderation (text and/or image)
 */
router.post(
  "/",
  // Apply optimized middleware chain
  ...optimizedMiddleware,
  // Validate request
  [
    body("text").optional().isString().withMessage("Text must be a string"),
    body("image")
      .optional()
      .isString()
      .withMessage("Image must be a base64 string"),
    body("config")
      .optional()
      .isObject()
      .withMessage("Config must be an object"),
    body("oldMessages")
      .optional()
      .isArray()
      .withMessage("oldMessages must be an array"),
  ],
  // Process the filter request
  filterController.filterContentRequest
);

/**
 * POST /v1/filter/batch
 * Filter multiple content items in a single request
 */
router.post(
  "/batch",
  // Apply optimized middleware chain
  ...optimizedMiddleware,
  // Validate request
  [
    body("items")
      .isArray()
      .withMessage("Items must be an array")
      .notEmpty()
      .withMessage("Items array cannot be empty"),
    body("items.*.text")
      .optional()
      .isString()
      .withMessage("Text must be a string"),
    body("items.*.image")
      .optional()
      .isString()
      .withMessage("Image must be a base64 string"),
    body("items.*.config")
      .optional()
      .isObject()
      .withMessage("Config must be an object"),
    body("items.*.oldMessages")
      .optional()
      .isArray()
      .withMessage("oldMessages must be an array"),
  ],
  // Process the batch filter request
  filterController.filterBatchRequest
);

/**
 * POST /v1/filter/text
 * Filter text-only content
 */
router.post(
  "/text",
  // Apply optimized middleware chain
  ...optimizedMiddleware,
  // Validate request
  [
    body("text").isString().withMessage("Text content is required"),
    body("config")
      .optional()
      .isObject()
      .withMessage("Config must be an object"),
    body("oldMessages")
      .optional()
      .isArray()
      .withMessage("oldMessages must be an array"),
  ],
  // Process the text filter request
  filterController.filterTextRequest
);

/**
 * POST /v1/filter/image
 * Filter image-only content
 */
router.post(
  "/image",
  // Apply optimized middleware chain
  ...optimizedMiddleware,
  // Validate request
  [
    body("image").isString().withMessage("Image content is required"),
    body("config")
      .optional()
      .isObject()
      .withMessage("Config must be an object"),
  ],
  // Process the image filter request
  filterController.filterImageRequest
);

// Health check endpoint - bypasses all middleware for fastest response
router.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    cacheStats: routeCache.getStats(),
  });
});

export default router;
