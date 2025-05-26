import type { Request, Response, NextFunction } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { AppError } from "../middleware/errorHandler";
import { statsIncrement } from "../utils/redis";
import {
  filterContent,
  validateFilterConfig,
  type FilterRequest,
  type FilterConfig,
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
      // Use destructuring with default values for faster access
      const { text = "", image, config, oldMessages = [], model } = req.body;

      // CRITICAL FIX: Validate config to ensure all flags default to false
      const validatedConfig = validateFilterConfig(config);

      // Create filter request - minimal construction for speed
      const filterRequest: FilterRequest = {
        text,
        image,
        config: validatedConfig,
        oldMessages,
        model,
      };

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

        // We're no longer tracking detailed controller performance metrics
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
          // CRITICAL FIX: Validate config to ensure all flags default to false
          const validatedConfig = validateFilterConfig(item.config);

          // Create filter request with minimal validation and construction
          const filterRequest: FilterRequest = {
            text: item.text || "",
            image: item.image,
            config: validatedConfig,
            oldMessages: item.oldMessages || [],
            model: item.model,
          };

          // Process filter request
          return await filterContent(filterRequest, req.userId || "anonymous");
        })
      );

      // PERFORMANCE OPTIMIZATION: Calculate processing time before response
      const processingTime = Math.round(performance.now() - startTime);

      // Set processing time header before sending response
      res.setHeader("X-Processing-Time", `${processingTime}ms`);

      // Send response immediately - this is the critical optimization
      res.status(200).json({ results });

      // Process non-essential tasks after response is sent
      setImmediate(() => {
        console.log(
          `[Controller] Batch request processed in ${processingTime}ms - response sent`
        );

        // Additional background logging or metrics can go here
        console.log(
          `[Controller] Background processing complete for batch request (${items.length} items)`
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
      const { text, config, oldMessages = [], model } = req.body;

      // Essential validation
      if (!text) {
        throw new AppError("Text content is required", 400);
      }

      // CRITICAL FIX: Validate config to ensure all flags default to false
      const validatedConfig = validateFilterConfig(config);

      // Create filter request with minimal construction
      const filterRequest: FilterRequest = {
        text,
        config: validatedConfig,
        oldMessages,
        model,
      };

      // Process filter request - critical operation
      const result = await filterContent(
        filterRequest,
        req.userId || "anonymous"
      );

      // PERFORMANCE OPTIMIZATION: Calculate processing time before response
      const processingTime = Math.round(performance.now() - startTime);

      // Set processing time header before sending response
      res.setHeader("X-Processing-Time", `${processingTime}ms`);

      // Send response immediately - this is the critical optimization
      res.status(200).json(result);

      // Process non-essential tasks after response is sent
      setImmediate(() => {
        console.log(
          `[Controller] Text request processed in ${processingTime}ms - response sent`
        );

        // Additional background logging or metrics can go here
        console.log(
          `[Controller] Background processing complete for text request`
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
      const { image, config, model } = req.body;

      // Essential validation
      if (!image) {
        throw new AppError("Image content is required", 400);
      }

      // CRITICAL FIX: Validate config to ensure all flags default to false
      const validatedConfig = validateFilterConfig(config);

      // Create filter request with minimal construction
      const filterRequest: FilterRequest = {
        text: "", // Empty text for image-only requests
        image,
        config: validatedConfig,
        model,
      };

      // Process filter request - critical operation
      const result = await filterContent(
        filterRequest,
        req.userId || "anonymous"
      );

      // PERFORMANCE OPTIMIZATION: Calculate processing time before response
      const processingTime = Math.round(performance.now() - startTime);

      // Set processing time header before sending response
      res.setHeader("X-Processing-Time", `${processingTime}ms`);

      // Send response immediately - this is the critical optimization
      res.status(200).json(result);

      // Process non-essential tasks after response is sent
      setImmediate(() => {
        console.log(
          `[Controller] Image request processed in ${processingTime}ms - response sent`
        );

        // Additional background logging or metrics can go here
        console.log(
          `[Controller] Background processing complete for image request`
        );
      });
    }
  ),
};
