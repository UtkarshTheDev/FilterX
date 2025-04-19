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
 * Controller for handling content filtering operations - optimized for maximum speed
 */
export const filterController = {
  /**
   * Process single content moderation request
   * Handles both text and image content
   */
  filterContentRequest: asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      // Start timer for performance tracking
      const startTime = performance.now();

      // Extract request data with minimal processing
      const { text, image, config, oldMessages } = req.body;

      // Create filter request - validation happens in the service
      const filterRequest: FilterRequest = {
        text: text || "",
        image: image,
        config: config || {},
        oldMessages: oldMessages || [],
      };

      // Process filter request
      const result = await filterContent(
        filterRequest,
        req.userId || "anonymous"
      );

      // Calculate processing time
      const processingTime = Math.round(performance.now() - startTime);

      // Add processing time to header for monitoring
      res.setHeader("X-Processing-Time", `${processingTime}ms`);

      // Send response immediately
      res.status(200).json(result);

      // Any additional processing can happen in the background (already handled in filterContent)
    }
  ),

  /**
   * Process batch content moderation requests
   * Handles multiple content items in a single request
   */
  filterBatchRequest: asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      // Start timer for performance tracking
      const startTime = performance.now();

      // Get batch items from request
      const { items } = req.body;

      if (!Array.isArray(items) || items.length === 0) {
        throw new AppError("Invalid batch request format", 400);
      }

      if (items.length > 10) {
        throw new AppError("Maximum 10 items per batch request", 400);
      }

      // Process each item in parallel for maximum speed
      const results = await Promise.all(
        items.map(async (item) => {
          // Create filter request with minimal validation
          const filterRequest: FilterRequest = {
            text: item.text || "",
            image: item.image,
            config: item.config || {},
            oldMessages: item.oldMessages || [],
          };

          // Process filter request
          return await filterContent(filterRequest, req.userId || "anonymous");
        })
      );

      // Calculate processing time
      const processingTime = Math.round(performance.now() - startTime);

      // Add processing time to header for monitoring
      res.setHeader("X-Processing-Time", `${processingTime}ms`);

      // Send response
      res.status(200).json({ results });

      // Additional processing is handled in the background in filterContent
    }
  ),

  /**
   * Process text-only content moderation request
   * Optimized for text-only filtering for maximum speed
   */
  filterTextRequest: asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      // Start timer for performance tracking
      const startTime = performance.now();

      // Extract request data with minimal validation
      const { text, config, oldMessages } = req.body;

      if (!text) {
        throw new AppError("Text content is required", 400);
      }

      // Create filter request
      const filterRequest: FilterRequest = {
        text,
        config: config || {},
        oldMessages: oldMessages || [],
      };

      // Process filter request
      const result = await filterContent(
        filterRequest,
        req.userId || "anonymous"
      );

      // Calculate processing time
      const processingTime = Math.round(performance.now() - startTime);

      // Add processing time to header for monitoring
      res.setHeader("X-Processing-Time", `${processingTime}ms`);

      // Send response
      res.status(200).json(result);

      // Additional processing is handled in the background in filterContent
    }
  ),

  /**
   * Process image-only content moderation request
   * Optimized for image-only filtering
   */
  filterImageRequest: asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      // Start timer for performance tracking
      const startTime = performance.now();

      // Extract request data
      const { image, config } = req.body;

      if (!image) {
        throw new AppError("Image content is required", 400);
      }

      // Create filter request
      const filterRequest: FilterRequest = {
        text: "", // Empty text for image-only requests
        image,
        config: config || {},
      };

      // Process filter request
      const result = await filterContent(
        filterRequest,
        req.userId || "anonymous"
      );

      // Calculate processing time
      const processingTime = Math.round(performance.now() - startTime);

      // Add processing time to header for monitoring
      res.setHeader("X-Processing-Time", `${processingTime}ms`);

      // Send response
      res.status(200).json(result);

      // Additional processing is handled in the background in filterContent
    }
  ),
};
