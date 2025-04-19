import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import {
  getSummaryStats,
  getDetailedPerformanceStats,
  getAIResponseTimeData,
} from "../services/statsService";
import type { Request, Response } from "express";

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

export default router;
