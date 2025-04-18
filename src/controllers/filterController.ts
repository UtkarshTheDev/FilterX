import type { Request, Response, NextFunction } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { AppError } from "../middleware/errorHandler";
import {
  filterContent,
  validateFilterConfig,
  validateOldMessages,
  type FilterRequest,
} from "../services/filterService";

/**
 * Controller for handling content filtering operations
 */
export const filterController = {
  /**
   * Process single content moderation request
   * Handles both text and image content
   */
  filterContentRequest: asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      // Extract request data
      const { text, image, config, oldMessages } = req.body;

      // Create filter request with validated input
      const filterRequest: FilterRequest = {
        text: text || "",
        image: image,
        config: validateFilterConfig(config),
        oldMessages: validateOldMessages(oldMessages),
      };

      // Process filter request
      const result = await filterContent(
        filterRequest,
        req.userId || "anonymous"
      );

      // Send response
      res.status(200).json(result);
    }
  ),

  /**
   * Process batch content moderation requests
   * Handles multiple content items in a single request
   */
  filterBatchRequest: asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      // Get batch items from request
      const { items } = req.body;

      if (!Array.isArray(items) || items.length === 0) {
        throw new AppError("Invalid batch request format", 400);
      }

      if (items.length > 10) {
        throw new AppError("Maximum 10 items per batch request", 400);
      }

      // Process each item in parallel
      const results = await Promise.all(
        items.map(async (item) => {
          // Create filter request with validated input
          const filterRequest: FilterRequest = {
            text: item.text || "",
            image: item.image,
            config: validateFilterConfig(item.config),
            oldMessages: validateOldMessages(item.oldMessages),
          };

          // Process filter request
          return await filterContent(filterRequest, req.userId || "anonymous");
        })
      );

      // Send response
      res.status(200).json({ results });
    }
  ),

  /**
   * Process text-only content moderation request
   * Optimized for text-only filtering
   */
  filterTextRequest: asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      // Extract request data
      const { text, config, oldMessages } = req.body;

      if (!text) {
        throw new AppError("Text content is required", 400);
      }

      // Create filter request
      const filterRequest: FilterRequest = {
        text,
        config: validateFilterConfig(config),
        oldMessages: validateOldMessages(oldMessages),
      };

      // Process filter request
      const result = await filterContent(
        filterRequest,
        req.userId || "anonymous"
      );

      // Send response
      res.status(200).json(result);
    }
  ),

  /**
   * Process image-only content moderation request
   * Optimized for image-only filtering
   */
  filterImageRequest: asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      // Extract request data
      const { image, config } = req.body;

      if (!image) {
        throw new AppError("Image content is required", 400);
      }

      // Create filter request
      const filterRequest: FilterRequest = {
        text: "", // Empty text for image-only requests
        image,
        config: validateFilterConfig(config),
      };

      // Process filter request
      const result = await filterContent(
        filterRequest,
        req.userId || "anonymous"
      );

      // Send response
      res.status(200).json(result);
    }
  ),
};
