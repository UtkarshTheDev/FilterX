import type { Request, Response, NextFunction } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { AppError } from "../middleware/errorHandler";
import { statsIncrement } from "../utils/redis";
import { filterContent, type FilterRequest } from "../services/filterService";

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
      // Use destructuring with default values for faster access
      const { text = "", image, config = {}, oldMessages = [] } = req.body;

      // Create filter request - minimal construction for speed
      const filterRequest: FilterRequest = { text, image, config, oldMessages };

      // Process filter request - this is the critical part that must run
      const result = await filterContent(
        filterRequest,
        req.userId || "anonymous"
      );

      // Track overall processing time before sending response
      const processingTime = Math.round(performance.now() - startTime);

      // Add processing time to response headers before sending
      res.setHeader("X-Processing-Time", `${processingTime}ms`);

      // Performance monitoring and early headers
      res.setHeader("X-Response-Time", `${processingTime}ms`);

      // Important: Add Cache-Control headers for CDN/browser caching when appropriate
      // Only cache safe responses and only for a short time
      if (!result.blocked) {
        // Safe content can be cached briefly
        res.setHeader("Cache-Control", "private, max-age=60");
      } else {
        // Blocked content should not be cached
        res.setHeader("Cache-Control", "no-store, max-age=0");
      }

      // Send response immediately before doing any additional processing
      res.status(200).json(result);

      // Move ALL non-essential operations after response is sent
      setImmediate(() => {
        // Log performance metrics
        console.log(`[Controller] Request processed in ${processingTime}ms`);

        // Track performance metrics
        if (processingTime < 50) {
          statsIncrement("filter:controller:under50ms").catch((err: Error) => {
            console.error("Error tracking performance metrics:", err);
          });
        } else if (processingTime < 100) {
          statsIncrement("filter:controller:under100ms").catch((err: Error) => {
            console.error("Error tracking performance metrics:", err);
          });
        } else if (processingTime < 200) {
          statsIncrement("filter:controller:under200ms").catch((err: Error) => {
            console.error("Error tracking performance metrics:", err);
          });
        } else {
          statsIncrement("filter:controller:over200ms").catch((err: Error) => {
            console.error("Error tracking performance metrics:", err);
          });
        }
      });
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

      // These validations are essential and must happen before processing
      if (!Array.isArray(items) || items.length === 0) {
        throw new AppError("Invalid batch request format", 400);
      }

      if (items.length > 10) {
        throw new AppError("Maximum 10 items per batch request", 400);
      }

      // Process each item in parallel for maximum speed
      const results = await Promise.all(
        items.map(async (item) => {
          // Create filter request with minimal validation and construction
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

      // Send response immediately
      res.status(200).json({ results });

      // Calculate processing time AFTER the response is sent
      setImmediate(() => {
        const processingTime = Math.round(performance.now() - startTime);

        // Set processing time in header
        // Note: This won't affect the response since it's already sent
        res.setHeader("X-Processing-Time", `${processingTime}ms`);

        console.log(
          `[Controller] Batch request processed in ${processingTime}ms`
        );
      });
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

      // Extract request data with default values for speed
      const { text, config = {}, oldMessages = [] } = req.body;

      // Essential validation
      if (!text) {
        throw new AppError("Text content is required", 400);
      }

      // Create filter request with minimal construction
      const filterRequest: FilterRequest = { text, config, oldMessages };

      // Process filter request - critical operation
      const result = await filterContent(
        filterRequest,
        req.userId || "anonymous"
      );

      // Send response immediately
      res.status(200).json(result);

      // Process non-essential tasks after response is sent
      setImmediate(() => {
        const processingTime = Math.round(performance.now() - startTime);

        // Set processing time in header (for logging only, response already sent)
        res.setHeader("X-Processing-Time", `${processingTime}ms`);

        console.log(
          `[Controller] Text request processed in ${processingTime}ms`
        );
      });
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

      // Extract request data with default values for speed
      const { image, config = {} } = req.body;

      // Essential validation
      if (!image) {
        throw new AppError("Image content is required", 400);
      }

      // Create filter request with minimal construction
      const filterRequest: FilterRequest = {
        text: "", // Empty text for image-only requests
        image,
        config,
      };

      // Process filter request - critical operation
      const result = await filterContent(
        filterRequest,
        req.userId || "anonymous"
      );

      // Send response immediately
      res.status(200).json(result);

      // Process non-essential tasks after response is sent
      setImmediate(() => {
        const processingTime = Math.round(performance.now() - startTime);

        // Set processing time in header (for logging only, response already sent)
        res.setHeader("X-Processing-Time", `${processingTime}ms`);

        console.log(
          `[Controller] Image request processed in ${processingTime}ms`
        );
      });
    }
  ),
};
