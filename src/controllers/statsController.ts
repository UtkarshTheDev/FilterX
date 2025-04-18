import type { Request, Response, NextFunction } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { getSummaryStats } from "../services/statsService";
import { isRedisHealthy } from "../utils/redis";
import { isDatabaseHealthy } from "../db";
import logger from "../utils/logger";

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
   * (placeholder for future implementation)
   */
  getUserStats: asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      return res.status(200).json({
        message: "User statistics endpoint - To be implemented",
        timestamp: new Date().toISOString(),
      });
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
