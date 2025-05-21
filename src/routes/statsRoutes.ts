import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import {
  getSummaryStats,
  getDetailedPerformanceStats,
  getAIResponseTimeData,
} from "../services/statsService";
import type { Request, Response } from "express";
import { statsController } from "../controllers/statsController";

// Create router
const router = Router();

/**
 * Get public stats summary
 * @route GET /stats
 * @group Stats - Performance statistics and metrics
 * @returns {object} 200 - System statistics
 */
router.get(
  "/summary",
  asyncHandler(async (req: Request, res: Response) => {
    const stats = await getSummaryStats();
    res.json(stats);
  })
);

/**
 * Get detailed API performance metrics
 * @route GET /stats/performance
 * @group Stats - Performance statistics and metrics
 * @returns {object} 200 - Detailed performance statistics
 */
router.get(
  "/performance",
  asyncHandler(async (req: Request, res: Response) => {
    const performance = await getDetailedPerformanceStats();
    res.json(performance);
  })
);

/**
 * Get AI response times for monitoring
 * @route GET /stats/ai-monitor
 * @group Stats - Performance statistics and metrics
 * @returns {object} 200 - AI response time data
 */
router.get(
  "/ai-monitor",
  asyncHandler(async (req: Request, res: Response) => {
    // Get the time range from query params (default to last 24 hours)
    const timeRange = (req.query.timeRange as string) || "24h";
    const limit = parseInt(req.query.limit as string) || 100;

    // Get AI response time data from the stats service
    const aiMonitorData = await getAIResponseTimeData(timeRange, limit);

    res.json({
      timeRange,
      limit,
      data: aiMonitorData,
    });
  })
);

/**
 * Get historical statistics from database
 * @route GET /stats/historical
 * @group Stats - Historical statistics from database
 * @returns {object} 200 - Historical statistics
 */
router.get("/historical", statsController.getHistoricalStats);

/**
 * Get combined statistics (recent + historical)
 * @route GET /stats/combined
 * @group Stats - Combined recent and historical statistics
 * @returns {object} 200 - Combined statistics
 */
router.get("/combined", statsController.getCombinedStats);

/**
 * Get user activity statistics
 * @route GET /stats/user/:userId
 * @group Stats - User activity statistics
 * @returns {object} 200 - User activity statistics
 */
router.get("/user/:userId", statsController.getUserStats);

export default router;
