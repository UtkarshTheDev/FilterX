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

/**
 * Controller for handling stats operations
 */
export const statsController = {
  /**
   * Get summary statistics
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
