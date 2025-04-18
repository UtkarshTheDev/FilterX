import type { Request, Response, NextFunction } from "express";
import logger from "../utils/logger";

// Custom error class with status code
export class AppError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Error handler middleware
export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Get error details
  const statusCode = "statusCode" in err ? err.statusCode : 500;
  const message = err.message || "Internal Server Error";
  const path = req.path;
  const method = req.method;

  // Log error with appropriate level based on status code
  if (statusCode >= 500) {
    logger.error(`${method} ${path} - ${statusCode} ${message}`, err);
  } else if (statusCode >= 400) {
    logger.warn(`${method} ${path} - ${statusCode} ${message}`);
  } else {
    logger.debug(`${method} ${path} - ${statusCode} ${message}`);
  }

  // Don't expose stack trace in production
  const errorResponse: any = {
    error: message,
  };

  if (process.env.NODE_ENV !== "production") {
    errorResponse.stack = err.stack;
  }

  res.status(statusCode).json(errorResponse);
};

// Catch 404 errors
export const notFoundHandler = (req: Request, res: Response) => {
  const path = req.path;
  const method = req.method;

  logger.warn(`${method} ${path} - 404 Resource Not Found`);
  res.status(404).json({ error: "Resource not found" });
};

// Async error handler to avoid try/catch in route handlers
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
