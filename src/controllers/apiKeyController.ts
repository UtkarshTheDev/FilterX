import type { Request, Response, NextFunction } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { AppError } from "../middleware/errorHandler";
import { getOrCreateApiKeyByIp, revokeApiKey } from "../services/apiKeyService";

/**
 * Controller for handling API key operations
 */
export const apiKeyController = {
  /**
   * Generate or retrieve API key for the client IP
   */
  getOrCreateApiKey: asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      const ip = req.ip || "127.0.0.1"; // Provide default value in case ip is undefined

      // Get or create API key for this IP
      const apiKey = await getOrCreateApiKeyByIp(ip);

      // Return only necessary information, not the internal database fields
      res.status(200).json({
        key: apiKey.key,
        userId: apiKey.userId,
        createdAt: apiKey.createdAt,
      });
    }
  ),

  /**
   * Revoke an API key
   */
  revokeApiKey: asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      const { key } = req.body;

      if (!key) {
        throw new AppError("API key is required", 400);
      }

      const result = await revokeApiKey(key);

      if (result) {
        return res
          .status(200)
          .json({ message: "API key revoked successfully" });
      } else {
        throw new AppError("API key not found or already revoked", 404);
      }
    }
  ),

  /**
   * Validate API key status
   */
  validateApiKey: asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      // The apiKeyAuth middleware already validated the API key
      // and attached it to the request

      if (!req.apiKey) {
        throw new AppError("API key validation failed", 401);
      }

      res.status(200).json({
        valid: true,
        userId: req.apiKey.userId,
        createdAt: req.apiKey.createdAt,
        lastUsedAt: req.apiKey.lastUsedAt,
      });
    }
  ),
};
