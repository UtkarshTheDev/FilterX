import express from "express";
import type { Request, Response } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { getSummaryStats } from "../services/statsService";

const router = express.Router();

/**
 * GET /admin/stats
 * Get summary statistics (publicly accessible)
 */
router.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const stats = await getSummaryStats();

    if (!stats) {
      return res.status(500).json({ error: "Failed to fetch stats" });
    }

    return res.status(200).json({
      stats,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || "1.0.0",
    });
  })
);

/**
 * GET /admin/stats/users
 * Get user-specific statistics (publicly accessible)
 */
router.get(
  "/users",
  asyncHandler(async (req: Request, res: Response) => {
    // This would be implemented to show per-user statistics
    // For now, we'll just return a placeholder
    return res.status(200).json({
      message: "User statistics endpoint - To be implemented",
      timestamp: new Date().toISOString(),
    });
  })
);

export default router;
