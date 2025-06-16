import type { Request, Response, NextFunction } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { getSummaryStats } from "../services/statsService";
import { isRedisHealthy } from "../utils/redis";
import { isDatabaseHealthy } from "../db";
import logger from "../utils/logger";
import {
  getHistoricalRequestStats,
  getHistoricalApiPerformance,
  getHistoricalContentFlags,
  getCombinedStats,
  getUserActivityStats,
} from "../services/statsHistoryService";
import {
  getDatabaseStats,
  getTimeSeriesData,
} from "../services/statsDbFirstService";
import { runStatsAggregation } from "../services/statsAggregator";

/**
 * Controller for handling stats operations
 */
export const statsController = {
  /**
   * Get summary statistics (ENHANCED: Database-first with Redis fallback)
   */
  getSummaryStats: asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      const stats = await getSummaryStats();

      if (!stats) {
        return res.status(500).json({ error: "Failed to fetch stats" });
      }

      return res.status(200).json({
        stats,
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || "1.0.0",
      });
    }
  ),

  /**
   * Run stats aggregation manually with smart data checking
   * This endpoint is designed for cron-job.org triggering:
   * - Checks Redis for data before connecting to database
   * - Returns immediately if no data exists (saves compute costs)
   * - Uses bulk operations to minimize database queries
   * - Provides detailed response for monitoring
   */
  runStatsAggregation: asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      const startTime = Date.now();
      logger.info("Stats aggregation requested via API");

      try {
        // Check if Redis is healthy (required for data checking)
        const redisHealthy = await isRedisHealthy();

        if (!redisHealthy) {
          logger.warn("Redis not healthy - proceeding with force run");
        }

        // Run aggregation with smart data checking
        const forceRun = req.query.force === 'true';
        const aggregationResult = await runStatsAggregation({
          forceRun,
          skipDataCheck: !redisHealthy
        });

        const duration = Date.now() - startTime;

        // Handle skipped aggregation (no data found)
        if (aggregationResult.skipped) {
          logger.info(`Aggregation skipped: ${aggregationResult.reason}`);
          return res.status(200).json({
            success: true,
            skipped: true,
            reason: aggregationResult.reason,
            message: "No data to aggregate - database connection avoided",
            recordsProcessed: 0,
            duration,
            timestamp: new Date().toISOString(),
            computeUsage: "zero",
          });
        }

        // Handle successful aggregation
        if (aggregationResult.success) {
          logger.info(`Aggregation completed: ${aggregationResult.recordsProcessed} records in ${duration}ms`);
          return res.status(200).json({
            success: true,
            message: "Stats aggregation completed successfully",
            recordsProcessed: aggregationResult.recordsProcessed,
            duration,
            timestamp: new Date().toISOString(),
            results: aggregationResult.results,
            computeUsage: "minimal",
          });
        }

        // Handle failed aggregation
        logger.error(`Aggregation failed: ${aggregationResult.errors.join(", ")}`);
        return res.status(500).json({
          success: false,
          error: "Stats aggregation failed",
          details: aggregationResult.errors,
          recordsProcessed: aggregationResult.recordsProcessed,
          duration,
          timestamp: new Date().toISOString(),
          results: aggregationResult.results,
        });

      } catch (error) {
        const duration = Date.now() - startTime;
        logger.error("Error in stats aggregation API:", error);

        return res.status(500).json({
          success: false,
          error: "Failed to execute stats aggregation",
          details: error instanceof Error ? error.message : String(error),
          duration,
          timestamp: new Date().toISOString(),
        });
      }
    }
  ),

  /**
   * NEW: Get comprehensive database-first statistics
   * This endpoint provides better performance and reliability than Redis-based stats
   * If no timeRange is provided, returns ALL stats (no time limitation)
   */
  getDatabaseStats: asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      // Get time range from query params (optional - if not provided, returns ALL stats)
      const timeRange = req.query.timeRange as string | undefined;

      // Validate time range if provided
      if (
        timeRange &&
        !["today", "yesterday", "7d", "30d"].includes(timeRange)
      ) {
        return res.status(400).json({
          error:
            "Invalid time range. Use 'today', 'yesterday', '7d', or '30d'. Leave empty for all-time stats.",
        });
      }

      try {
        const stats = await getDatabaseStats(timeRange);
        return res.status(200).json({
          success: true,
          ...stats,
          version: process.env.npm_package_version || "1.0.0",
        });
      } catch (error) {
        logger.error("Error getting database stats:", error);
        return res.status(500).json({
          error: "Failed to fetch database statistics",
          timestamp: new Date().toISOString(),
        });
      }
    }
  ),

  /**
   * NEW: Get time-series data for charts and analytics
   */
  getTimeSeriesData: asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      // Get date range from query params with defaults
      const endDate =
        (req.query.endDate as string) || new Date().toISOString().split("T")[0];

      // Default start date is 7 days before end date
      const defaultStartDate = new Date(endDate);
      defaultStartDate.setDate(defaultStartDate.getDate() - 7);
      const startDate =
        (req.query.startDate as string) ||
        defaultStartDate.toISOString().split("T")[0];

      // Get granularity with default
      const granularity =
        (req.query.granularity as "daily" | "hourly") || "daily";

      // Validate date format
      if (!isValidDateFormat(startDate) || !isValidDateFormat(endDate)) {
        return res.status(400).json({
          error: "Invalid date format. Use YYYY-MM-DD format.",
        });
      }

      // Validate granularity
      if (!["daily", "hourly"].includes(granularity)) {
        return res.status(400).json({
          error: "Invalid granularity. Use 'daily' or 'hourly'.",
        });
      }

      try {
        const timeSeriesData = await getTimeSeriesData(
          startDate,
          endDate,
          granularity
        );
        return res.status(200).json({
          success: true,
          startDate,
          endDate,
          timestamp: new Date().toISOString(),
          ...timeSeriesData,
        });
      } catch (error) {
        logger.error("Error getting time-series data:", error);
        return res.status(500).json({
          error: "Failed to fetch time-series data",
          timestamp: new Date().toISOString(),
        });
      }
    }
  ),

  /**
   * Get user-specific statistics
   */
  getUserStats: asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      // Get user ID from route params
      const userId = req.params.userId || req.query.userId;

      if (!userId) {
        return res.status(400).json({
          error: "User ID is required",
        });
      }

      // Get date range from query params with defaults
      const endDate =
        (req.query.endDate as string) || new Date().toISOString().split("T")[0];

      // Default start date is 30 days before end date
      const defaultStartDate = new Date(endDate);
      defaultStartDate.setDate(defaultStartDate.getDate() - 30);
      const startDate =
        (req.query.startDate as string) ||
        defaultStartDate.toISOString().split("T")[0];

      // Validate date format
      if (!isValidDateFormat(startDate) || !isValidDateFormat(endDate)) {
        return res.status(400).json({
          error: "Invalid date format. Use YYYY-MM-DD format.",
        });
      }

      const stats = await getUserActivityStats(
        userId as string,
        startDate,
        endDate
      );
      return res.status(200).json({
        userId,
        startDate,
        endDate,
        timestamp: new Date().toISOString(),
        stats,
      });
    }
  ),

  /**
   * Get historical request statistics from database
   */
  getHistoricalStats: asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      // Get date range from query params with defaults
      const endDate =
        (req.query.endDate as string) || new Date().toISOString().split("T")[0];

      // Default start date is 7 days before end date
      const defaultStartDate = new Date(endDate);
      defaultStartDate.setDate(defaultStartDate.getDate() - 7);
      const startDate =
        (req.query.startDate as string) ||
        defaultStartDate.toISOString().split("T")[0];

      // Validate date format
      if (!isValidDateFormat(startDate) || !isValidDateFormat(endDate)) {
        return res.status(400).json({
          error: "Invalid date format. Use YYYY-MM-DD format.",
        });
      }

      const requestStats = await getHistoricalRequestStats(startDate, endDate);
      const contentFlags = await getHistoricalContentFlags(startDate, endDate);
      const apiPerformance = await getHistoricalApiPerformance(
        startDate,
        endDate
      );

      return res.status(200).json({
        startDate,
        endDate,
        timestamp: new Date().toISOString(),
        stats: {
          requestStats,
          contentFlags,
          apiPerformance,
        },
      });
    }
  ),

  /**
   * Get combined stats (recent from Redis + historical from database)
   */
  getCombinedStats: asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      // Get time range from query params with default
      const timeRange = (req.query.timeRange as string) || "24h";

      // Validate time range
      if (!["1h", "24h", "7d", "30d"].includes(timeRange)) {
        return res.status(400).json({
          error: "Invalid time range. Use '1h', '24h', '7d', or '30d'.",
        });
      }

      const stats = await getCombinedStats(timeRange);
      return res.status(200).json(stats);
    }
  ),

  /**
   * Get health status of all services
   */
  getHealthStatus: asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      logger.debug("Health check requested");

      // Check all services health
      const redisHealthy = await isRedisHealthy();
      const dbHealthy = await isDatabaseHealthy();

      // Overall status is healthy only if all services are healthy
      const isHealthy = redisHealthy && dbHealthy;

      // Detailed health status for each service
      const healthStatus = {
        status: isHealthy ? "healthy" : "degraded",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || "1.0.0",
        services: {
          api: {
            status: "healthy", // API is responding, so it's healthy
          },
          redis: {
            status: redisHealthy ? "healthy" : "unhealthy",
          },
          database: {
            status: dbHealthy ? "healthy" : "unhealthy",
          },
        },
      };

      // Set appropriate status code based on health
      const statusCode = isHealthy ? 200 : 503; // 503 Service Unavailable if not healthy

      res.status(statusCode).json(healthStatus);
    }
  ),
};

/**
 * Helper function to validate date format (YYYY-MM-DD)
 */
function isValidDateFormat(dateString: string): boolean {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) return false;

  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime());
}
