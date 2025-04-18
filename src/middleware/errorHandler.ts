import type { Request, Response, NextFunction } from "express";

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
  console.error(`Error: ${err}`);

  // Default to 500 internal server error if no status code is available
  const statusCode = "statusCode" in err ? err.statusCode : 500;
  const message = err.message || "Internal Server Error";

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
  res.status(404).json({ error: "Resource not found" });
};

// Async error handler to avoid try/catch in route handlers
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
