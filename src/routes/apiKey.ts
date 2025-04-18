import express from "express";
import { body } from "express-validator";
import { apiKeyRateLimiter } from "../middleware/rateLimiter";
import { apiKeyAuth } from "../middleware/auth";
import { apiKeyController } from "../controllers/apiKeyController";

const router = express.Router();

/**
 * GET /v1/apikey
 * Generate or retrieve API key for the client IP
 */
router.get("/", apiKeyRateLimiter, apiKeyController.getOrCreateApiKey);

/**
 * POST /v1/apikey/revoke
 * Revoke an API key (publicly accessible)
 */
router.post(
  "/revoke",
  [body("key").isString().withMessage("API key is required")],
  apiKeyController.revokeApiKey
);

/**
 * GET /v1/apikey/validate
 * Validate an API key
 */
router.get(
  "/validate",
  apiKeyRateLimiter,
  apiKeyAuth,
  apiKeyController.validateApiKey
);

export default router;
