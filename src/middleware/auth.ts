import type { Request, Response, NextFunction } from "express";
import { validateApiKey } from "../services/apiKeyService";
import { AppError } from "./errorHandler";
import { config } from "../config";

// Add custom properties to the Request type
declare global {
  namespace Express {
    interface Request {
      apiKey?: any;
      userId?: string;
    }
  }
}

/**
 * Extract API key from request
 * @param req Express request
 * @returns API key string
 */
const extractApiKey = (req: Request): string | null => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7); // Remove 'Bearer ' prefix
  }

  if (req.query.apiKey) {
    return req.query.apiKey as string;
  }

  return null;
};

/**
 * API key authentication middleware
 */
export const apiKeyAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const apiKey = extractApiKey(req);

    if (!apiKey) {
      throw new AppError("API key is required", 401);
    }

    const validApiKey = await validateApiKey(apiKey);

    if (!validApiKey) {
      throw new AppError("Invalid API key", 401);
    }

    // Attach API key and userId to request
    req.apiKey = validApiKey;
    req.userId = validApiKey.userId;

    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
    } else {
      next(new AppError("Authentication failed", 401));
    }
  }
};

/**
 * Verify admin token middleware
 * This middleware secures admin routes by checking for a valid admin token
 */
export const verifyAdminToken = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new AppError("Admin authentication required", 401);
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Check admin token from config
    // Admin token is stored in environment variables for security
    const adminToken = process.env.ADMIN_TOKEN || config.adminToken;

    if (!adminToken) {
      console.error("Admin token not configured in environment variables");
      throw new AppError("Admin authentication failed", 500);
    }

    if (token !== adminToken) {
      throw new AppError("Invalid admin token", 401);
    }

    // If admin token is valid, proceed
    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
    } else {
      next(new AppError("Admin authentication failed", 401));
    }
  }
};
