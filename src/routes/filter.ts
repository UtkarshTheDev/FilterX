import express from "express";
import { body } from "express-validator";
import { apiKeyAuth } from "../middleware/auth";
import { filterRateLimiter } from "../middleware/rateLimiter";
import { asyncHandler } from "../middleware/errorHandler";
import { filterController } from "../controllers/filterController";

const router = express.Router();

/**
 * POST /v1/filter
 * Filter content for moderation (text and/or image)
 */
router.post(
  "/",
  // Apply rate limiting
  filterRateLimiter,
  // Apply API key authentication
  apiKeyAuth,
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
  // Apply rate limiting
  filterRateLimiter,
  // Apply API key authentication
  apiKeyAuth,
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
  // Apply rate limiting
  filterRateLimiter,
  // Apply API key authentication
  apiKeyAuth,
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
  // Apply rate limiting
  filterRateLimiter,
  // Apply API key authentication
  apiKeyAuth,
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

export default router;
