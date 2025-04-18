import express from "express";
import type { Request, Response } from "express";
import { body, validationResult } from "express-validator";
import { asyncHandler } from "../middleware/errorHandler";
import { apiKeyAuth } from "../middleware/auth";
import { filterRateLimiter } from "../middleware/rateLimiter";
import {
  filterContent,
  validateFilterConfig,
  validateOldMessages,
} from "../services/filterService";
import { AppError } from "../middleware/errorHandler";

const router = express.Router();

/**
 * POST /v1/filter
 * Filter content for moderation
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

  // Handler
  asyncHandler(async (req: Request, res: Response) => {
    // Validate request body
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError(`Invalid request: ${errors.array()[0].msg}`, 400);
    }

    // Require at least text or image
    if (!req.body.text && !req.body.image) {
      throw new AppError("Either text or image is required", 400);
    }

    // Validate old messages array (limit to 15)
    if (req.body.oldMessages && req.body.oldMessages.length > 15) {
      throw new AppError("Maximum 15 previous messages allowed", 400);
    }

    // Validate and process content
    const { text, image, config, oldMessages } = req.body;

    // Validate config
    const validatedConfig = validateFilterConfig(config);

    // Validate old messages
    const validatedOldMessages = validateOldMessages(oldMessages);

    // Filter content
    const result = await filterContent(
      {
        text: text || "",
        image: image,
        config: validatedConfig,
        oldMessages: validatedOldMessages,
      },
      req.userId || "anonymous"
    );

    // Send response
    res.status(200).json(result);
  })
);

export default router;
