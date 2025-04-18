import express from "express";
import type { Request, Response } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { getOrCreateApiKeyByIp, revokeApiKey } from "../services/apiKeyService";
import { apiKeyRateLimiter } from "../middleware/rateLimiter";
import { adminAuth } from "../middleware/auth";

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
 * Revoke an API key (admin only)
 */
router.post(
  "/revoke",
  adminAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { key } = req.body;

    if (!key) {
      return res.status(400).json({ error: "API key is required" });
    }

    const result = await revokeApiKey(key);

    if (result) {
      return res.status(200).json({ message: "API key revoked successfully" });
    } else {
      return res
        .status(404)
        .json({ error: "API key not found or already revoked" });
    }
  })
);

export default router;
