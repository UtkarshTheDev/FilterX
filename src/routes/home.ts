import express from "express";
import { homeController } from "../controllers/homeController";
import { homeRateLimiter } from "../middleware/rateLimiter";

const router = express.Router();

/**
 * GET / - Main home/root endpoint
 * Provides comprehensive API information, usage guidance, and attribution
 * 
 * Features:
 * - Welcome message and API overview
 * - Authentication and usage instructions
 * - Quick start guide with examples
 * - Attribution to creator (Utkarsh Tiwari)
 * - GitHub repository links
 * - Performance metrics and capabilities
 * - Rate limited to prevent abuse
 */
router.get("/", homeRateLimiter, homeController.getHome);

export default router;
