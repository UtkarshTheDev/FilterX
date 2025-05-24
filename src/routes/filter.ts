import express from "express";
import type { RequestHandler } from "express";
import { body } from "express-validator";
import { apiKeyAuth } from "../middleware/auth";
import { filterRateLimiter } from "../middleware/rateLimiter";
import { asyncHandler } from "../middleware/errorHandler";
import { filterController } from "../controllers/filterController";
import { config } from "../config";
import logger from "../utils/logger";
import { AdvancedRouteCache, EvictionPolicy } from "../utils/advancedCache";

const router = express.Router();

// Route-level in-memory response cache for frequent identical requests
// This allows bypassing all middleware and database access for repeat requests
// dramatically improving response times with advanced eviction policies

// Create advanced route cache singleton with hybrid eviction policy
// Uses configuration values with environment-based defaults
const routeCache = new AdvancedRouteCache(
  config.caching.routeCacheSize,
  config.caching.defaultTTL / 60, // Convert to seconds
  config.caching.routeCacheMemoryMB,
  EvictionPolicy.HYBRID // Use hybrid policy for best performance
);

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

// Fast hash function for route cache keys (same as in cache.ts)
const fastRouteHash = (str: string): string => {
  let hash = 2166136261; // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 16777619) >>> 0; // FNV prime, convert to unsigned 32-bit
  }
  return hash.toString(36); // Base36 for shorter strings
};

// Generate an optimized cache key from the request
const generateCacheKey = (req: express.Request): string => {
  // Extract essential components for cache key
  const apiKey =
    req.headers.authorization?.replace("Bearer ", "") || req.query.apiKey || "";

  // For filter requests, normalize the request body for better cache hits
  const normalizedBody = { ...req.body };

  // Remove non-deterministic parts and limit context for better hit rates
  if (normalizedBody.oldMessages && Array.isArray(normalizedBody.oldMessages)) {
    // Only use the last 3 messages for cache key to improve hit rate
    normalizedBody.oldMessages = normalizedBody.oldMessages.slice(-3);
  }

  // Create optimized string for hashing - avoid JSON.stringify overhead for simple cases
  let bodyString = "";
  if (normalizedBody.text) {
    // For text, take a sample if it's long to reduce key size
    const text = normalizedBody.text;
    bodyString +=
      text.length > 200
        ? text.substring(0, 100) + text.substring(text.length - 100)
        : text;
  }
  if (normalizedBody.image) {
    // For images, just use a portion of the hash
    bodyString += normalizedBody.image.substring(0, 50);
  }
  if (normalizedBody.config) {
    // Serialize config in a deterministic way
    const configKeys = Object.keys(normalizedBody.config).sort();
    bodyString += configKeys
      .map((k) => `${k}:${normalizedBody.config[k]}`)
      .join(",");
  }
  if (normalizedBody.oldMessages) {
    bodyString += normalizedBody.oldMessages.length.toString();
  }
  if (normalizedBody.model) {
    bodyString += `|model:${normalizedBody.model}`;
  }

  // Create compact string to hash
  const stringToHash = `${req.originalUrl}|${req.method}|${apiKey}|${bodyString}`;

  // Use fast hash function
  return `route:${fastRouteHash(stringToHash)}`;
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

// Ultra-fast middleware chain for high-performance scenarios (e.g., batch processing)
// Skips rate limiting for trusted use cases where it's managed elsewhere
const ultraFastMiddleware: RequestHandler[] = [
  // Apply only route caching and API key auth for maximum speed
  createCacheMiddleware(120), // longer cache duration
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
    body("model")
      .optional()
      .isIn(["pro", "normal", "fast"])
      .withMessage("Model must be one of: pro, normal, fast"),
  ],
  // Process the filter request
  filterController.filterContentRequest
);

/**
 * POST /v1/filter/performance-test
 * Special route for performance testing with minimum overhead
 * Uses the ultra-fast middleware chain
 */
router.post(
  "/performance-test",
  ...ultraFastMiddleware,
  [body("text").optional().isString().withMessage("Text must be a string")],
  asyncHandler(async (req: express.Request, res: express.Response) => {
    const startTime = performance.now();

    // Just return success immediately to test route overhead
    const processingTime = Math.round(performance.now() - startTime);

    res.status(200).json({
      success: true,
      processingTime: processingTime,
      message: "Performance test endpoint",
    });
  })
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
    body("items.*.model")
      .optional()
      .isIn(["pro", "normal", "fast"])
      .withMessage("Model must be one of: pro, normal, fast"),
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
    body("model")
      .optional()
      .isIn(["pro", "normal", "fast"])
      .withMessage("Model must be one of: pro, normal, fast"),
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
    body("model")
      .optional()
      .isIn(["pro", "normal", "fast"])
      .withMessage("Model must be one of: pro, normal, fast"),
  ],
  // Process the image filter request
  filterController.filterImageRequest
);

// Health check endpoint - bypasses all middleware for fastest response
router.get("/health", (req, res) => {
  const cacheStats = routeCache.getStats();
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    cache: {
      ...cacheStats,
      policy: "hybrid",
      optimizations: "fast_hash,lfu_eviction,memory_aware",
    },
  });
});

export default router;
