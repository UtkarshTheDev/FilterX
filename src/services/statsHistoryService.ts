import { db } from "../db";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import {
  requestStatsDaily,
  apiPerformanceHourly,
  contentFlagsDaily,
  userActivityDaily,
} from "../models/statsSchema";
import logger from "../utils/logger";
import { getSummaryStats } from "./statsService";

/**
 * Get historical request statistics from the database
 * @param startDate Start date in YYYY-MM-DD format
 * @param endDate End date in YYYY-MM-DD format
 */
export async function getHistoricalRequestStats(
  startDate: string,
  endDate: string
) {
  try {
    logger.debug(
      `Getting historical request stats from ${startDate} to ${endDate}`
    );

    // Query database for daily stats
    const dailyStats = await db
      .select()
      .from(requestStatsDaily)
      .where(
        and(
          gte(requestStatsDaily.date, startDate),
          lte(requestStatsDaily.date, endDate)
        )
      )
      .orderBy(requestStatsDaily.date);

    return dailyStats;
  } catch (error) {
    logger.error("Error getting historical request stats:", error);
    return [];
  }
}

/**
 * Get historical API performance metrics from the database
 * @param startDate Start date in YYYY-MM-DD format
 * @param endDate End date in YYYY-MM-DD format
 * @param apiType Optional API type filter ('text' or 'image')
 */
export async function getHistoricalApiPerformance(
  startDate: string,
  endDate: string,
  apiType?: "text" | "image"
) {
  try {
    logger.debug(
      `Getting historical API performance from ${startDate} to ${endDate}`
    );

    // Create base query
    let query = db
      .select()
      .from(apiPerformanceHourly)
      .where(
        and(
          gte(
            apiPerformanceHourly.timestamp,
            new Date(`${startDate}T00:00:00Z`)
          ),
          lte(apiPerformanceHourly.timestamp, new Date(`${endDate}T23:59:59Z`))
        )
      );

    // Add API type filter if specified
    if (apiType) {
      query = query.where(eq(apiPerformanceHourly.apiType, apiType));
    }

    // Execute query with ordering
    const apiPerformance = await query.orderBy(
      apiPerformanceHourly.timestamp,
      apiPerformanceHourly.apiType
    );

    return apiPerformance;
  } catch (error) {
    logger.error("Error getting historical API performance:", error);
    return [];
  }
}

/**
 * Get historical content flag statistics from the database
 * @param startDate Start date in YYYY-MM-DD format
 * @param endDate End date in YYYY-MM-DD format
 */
export async function getHistoricalContentFlags(
  startDate: string,
  endDate: string
) {
  try {
    logger.debug(
      `Getting historical content flags from ${startDate} to ${endDate}`
    );

    // Query database for flag stats
    const flagStats = await db
      .select()
      .from(contentFlagsDaily)
      .where(
        and(
          gte(contentFlagsDaily.date, startDate),
          lte(contentFlagsDaily.date, endDate)
        )
      )
      .orderBy(contentFlagsDaily.date, contentFlagsDaily.flagName);

    return flagStats;
  } catch (error) {
    logger.error("Error getting historical content flags:", error);
    return [];
  }
}

/**
 * Get combined stats (recent from Redis + historical from database)
 * @param timeRange Time range ('1h', '24h', '7d', '30d')
 */
export async function getCombinedStats(timeRange: string = "24h") {
  try {
    // Calculate date range based on time range
    const endDate = new Date().toISOString().split("T")[0]; // Today
    let startDate = endDate;

    if (timeRange === "24h") {
      // Yesterday
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      startDate = yesterday.toISOString().split("T")[0];
    } else if (timeRange === "7d") {
      // 7 days ago
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      startDate = weekAgo.toISOString().split("T")[0];
    } else if (timeRange === "30d") {
      // 30 days ago
      const monthAgo = new Date();
      monthAgo.setDate(monthAgo.getDate() - 30);
      startDate = monthAgo.toISOString().split("T")[0];
    }

    // For very recent stats (last hour), just use Redis
    if (timeRange === "1h") {
      return await getSummaryStats();
    }

    // Get historical data from database
    const [requestStats, apiPerformance, contentFlags] = await Promise.all([
      getHistoricalRequestStats(startDate, endDate),
      getHistoricalApiPerformance(startDate, endDate),
      getHistoricalContentFlags(startDate, endDate),
    ]);

    // Get recent stats from Redis
    const recentStats = await getSummaryStats();

    // Combine the data
    return {
      timeRange,
      timestamp: new Date().toISOString(),
      recentStats,
      historicalStats: {
        requestStats,
        apiPerformance,
        contentFlags,
      },
    };
  } catch (error) {
    logger.error("Error getting combined stats:", error);
    return {
      error: "Failed to retrieve statistics",
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Get user activity statistics for a specific user
 * @param userId User ID to get stats for
 * @param startDate Start date in YYYY-MM-DD format
 * @param endDate End date in YYYY-MM-DD format
 */
export async function getUserActivityStats(
  userId: string,
  startDate: string,
  endDate: string
) {
  try {
    logger.debug(
      `Getting user activity stats for ${userId} from ${startDate} to ${endDate}`
    );

    // Query database for user activity
    const userStats = await db
      .select()
      .from(userActivityDaily)
      .where(
        and(
          eq(userActivityDaily.userId, userId),
          gte(userActivityDaily.date, startDate),
          lte(userActivityDaily.date, endDate)
        )
      )
      .orderBy(userActivityDaily.date);

    return userStats;
  } catch (error) {
    logger.error(`Error getting user activity stats for ${userId}:`, error);
    return [];
  }
}
