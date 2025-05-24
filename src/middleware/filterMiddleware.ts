import type { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";
import { AppError } from "./errorHandler";
import {
  filterContent,
  validateFilterConfig,
  validateOldMessages,
} from "../services/filterService";
import type {
  FilterRequest,
  FilterResponse,
  FilterConfig,
} from "../services/filterService";
import { asyncHandler } from "./errorHandler";

/**
 * Main filter middleware to process content moderation requests
 * This integrates:
 * 1. Request validation
 * 2. Filtering logic
 * 3. Response formatting
 */
export const processFilterRequest = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    // Check validation errors from express-validator
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

    // Extract request data
    const { text, image, config, oldMessages } = req.body;

    // Validate config and old messages
    const validatedConfig = validateFilterConfig(config);
    const validatedOldMessages = validateOldMessages(oldMessages);

    // Create filter request
    const filterRequest: FilterRequest = {
      text: text || "",
      image: image,
      config: validatedConfig,
      oldMessages: validatedOldMessages,
    };

    // Process filter request
    const filterResult: FilterResponse = await filterContent(
      filterRequest,
      req.userId || "anonymous"
    );

    // Attach the result to the response object
    res.locals.filterResult = filterResult;

    // Continue to the next middleware or route handler
    next();
  }
);

/**
 * Response handler middleware to format and send the filter response
 */
export const sendFilterResponse = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Get filter result from res.locals
    const filterResult = res.locals.filterResult as FilterResponse;

    if (!filterResult) {
      throw new AppError("Filter result not found", 500);
    }

    // Send response
    res.status(200).json(filterResult);
  } catch (error) {
    next(error);
  }
};
