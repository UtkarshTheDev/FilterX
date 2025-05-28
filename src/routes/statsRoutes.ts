import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import {
  getSummaryStats,
  getDetailedPerformanceStats,
  getAIResponseTimeData,
} from "../services/statsService";
import type { Request, Response } from "express";
import { statsController } from "../controllers/statsController";
import rateLimit from "express-rate-limit";

// Create router
const router = Router();

// Rate limiter specifically for the aggregate endpoint (2 requests per minute)
const aggregateRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 2, // 2 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { 
    error: "Stats aggregation rate limit exceeded. Only 2 requests per minute allowed.",
    retryAfter: "60 seconds"
  },
  skipFailedRequests: false,
  skipSuccessfulRequests: false,
});

/**
 * Get comprehensive database-first statistics (MAIN ENDPOINT)
 * @route GET /stats
 * @group Stats - Main statistics endpoint (RECOMMENDED)
 * @returns {object} 200 - Comprehensive database statistics
 */
router.get("/", statsController.getDatabaseStats);

/**
 * NEW: Run stats aggregation manually
 * @route GET /stats/aggregate
 * @group Stats - Manual stats aggregation
 * @returns {object} 200 - Aggregation results
 */
router.get("/aggregate", aggregateRateLimiter, statsController.runStatsAggregation);

/**
 * Get public stats summary (LEGACY - use / instead)
 * @route GET /stats/summary
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
 * NEW: Get time-series data for charts and analytics
 * @route GET /stats/timeseries
 * @group Stats - Time-series data for analytics
 * @returns {object} 200 - Time-series statistics data
 */
router.get("/timeseries", statsController.getTimeSeriesData);

/**
 * Get user activity statistics
 * @route GET /stats/user/:userId
 * @group Stats - User activity statistics
 * @returns {object} 200 - User activity statistics
 */
router.get("/user/:userId", statsController.getUserStats);

export default router;
