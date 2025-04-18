import express from "express";
import type { Request, Response } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { getOrCreateApiKeyByIp, revokeApiKey } from "../services/apiKeyService";
import { apiKeyRateLimiter } from "../middleware/rateLimiter";
import { AppError } from "../middleware/errorHandler";

const router = express.Router();

/**
 * GET /v1/apikey
 * Generate or retrieve API key for the client IP
 */
router.get(
  "/",
  apiKeyRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const ip = req.ip || "127.0.0.1"; // Provide default value in case ip is undefined

    // Get or create API key for this IP
    const apiKey = await getOrCreateApiKeyByIp(ip);

    // Return only necessary information, not the internal database fields
    res.status(200).json({
      key: apiKey.key,
      userId: apiKey.userId,
      createdAt: apiKey.createdAt,
    });
  })
);

/**
 * POST /v1/apikey/revoke
 * Revoke an API key (publicly accessible)
 */
router.post(
  "/revoke",
  asyncHandler(async (req: Request, res: Response) => {
    const { key } = req.body;

    if (!key) {
      throw new AppError("API key is required", 400);
    }

    const result = await revokeApiKey(key);

    if (result) {
      return res.status(200).json({ message: "API key revoked successfully" });
    } else {
      throw new AppError("API key not found or already revoked", 404);
    }
  })
);

export default router;
