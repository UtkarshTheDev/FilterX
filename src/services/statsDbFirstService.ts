import { db } from "../db";
import {
  eq,
  and,
  gte,
  lte,
  desc,
  sql,
  sum,
  avg,
  max,
  min,
  count,
} from "drizzle-orm";
import {
  requestStatsDaily,
  apiPerformanceHourly,
  contentFlagsDaily,
  userActivityDaily,
} from "../models/statsSchema";
import logger from "../utils/logger";

/**
 * DATABASE-FIRST STATS SERVICE
 *
 * This service provides a comprehensive database-first approach to statistics
 * that prioritizes database queries over Redis cache for better reliability,
 * consistency, and performance.
 */

/**
 * Get comprehensive real-time stats directly from database
 * This replaces the Redis-dependent getSummaryStats with a database-first approach
 */
export async function getDatabaseStats(timeRange?: string) {
  try {
    logger.info(`Getting database stats for timeRange: ${timeRange || "all"}`);

    const now = new Date();
    let startDate: string | null = null;
    let endDate: string | null = null;

    // Calculate date range based on timeRange parameter
    // If no timeRange provided, get ALL stats (no date limitation)
    if (timeRange) {
      switch (timeRange) {
        case "today":
          startDate = endDate = now.toISOString().split("T")[0];
          break;
        case "yesterday":
          const yesterday = new Date(now);
          yesterday.setDate(yesterday.getDate() - 1);
          startDate = endDate = yesterday.toISOString().split("T")[0];
          break;
        case "7d":
          const weekAgo = new Date(now);
          weekAgo.setDate(weekAgo.getDate() - 7);
          startDate = weekAgo.toISOString().split("T")[0];
          endDate = now.toISOString().split("T")[0];
          break;
        case "30d":
          const monthAgo = new Date(now);
          monthAgo.setDate(monthAgo.getDate() - 30);
          startDate = monthAgo.toISOString().split("T")[0];
          endDate = now.toISOString().split("T")[0];
          break;
        default:
          // Invalid timeRange, default to today
          startDate = endDate = now.toISOString().split("T")[0];
      }
    }
    // If timeRange is null/undefined, startDate and endDate remain null (no date filter)

    // Get aggregated request statistics
    const requestStats = await getAggregatedRequestStats(startDate, endDate);

    // Get API performance statistics
    const apiStats = await getAggregatedApiStats(startDate, endDate);

    // Get content flags statistics
    const flagStats = await getAggregatedFlagStats(startDate, endDate);

    // Get user activity statistics
    const userStats = await getAggregatedUserStats(startDate, endDate);

    return {
      timeRange: timeRange || "all",
      startDate: startDate || "all-time",
      endDate: endDate || "all-time",
      timestamp: new Date().toISOString(),
      dataSource: "database",
      stats: {
        requests: requestStats,
        api: apiStats,
        flags: flagStats,
        users: userStats,
      },
    };
  } catch (error) {
    logger.error("Error getting database stats:", error);
    throw error;
  }
}

/**
 * Get aggregated request statistics from database
 */
async function getAggregatedRequestStats(
  startDate: string | null,
  endDate: string | null
) {
  try {
    let query = db
      .select({
        totalRequests: sum(requestStatsDaily.totalRequests).as(
          "total_requests"
        ),
        filteredRequests: sum(requestStatsDaily.filteredRequests).as(
          "filtered_requests"
        ),
        blockedRequests: sum(requestStatsDaily.blockedRequests).as(
          "blocked_requests"
        ),
        cachedRequests: sum(requestStatsDaily.cachedRequests).as(
          "cached_requests"
        ),
        avgResponseTime: avg(requestStatsDaily.avgResponseTimeMs).as(
          "avg_response_time"
        ),
        maxP95ResponseTime: max(requestStatsDaily.p95ResponseTimeMs).as(
          "max_p95_response_time"
        ),
        minResponseTime: min(requestStatsDaily.avgResponseTimeMs).as(
          "min_response_time"
        ),
        recordCount: count().as("record_count"),
      })
      .from(requestStatsDaily);

    // Only add date filter if dates are provided (not null)
    if (startDate && endDate) {
      query = query.where(
        and(
          gte(requestStatsDaily.date, startDate),
          lte(requestStatsDaily.date, endDate)
        )
      );
    }

    const results = await query;

    const stats = results[0];
    const totalReq = Number(stats.totalRequests) || 0;
    const cachedReq = Number(stats.cachedRequests) || 0;

    return {
      totalRequests: totalReq,
      filteredRequests: Number(stats.filteredRequests) || 0,
      blockedRequests: Number(stats.blockedRequests) || 0,
      cachedRequests: cachedReq,
      cacheHitRate: totalReq > 0 ? Math.round((cachedReq / totalReq) * 100) : 0,
      avgResponseTime: Math.round(Number(stats.avgResponseTime) || 0),
      p95ResponseTime: Number(stats.maxP95ResponseTime) || 0,
      minResponseTime: Number(stats.minResponseTime) || 0,
      daysWithData: Number(stats.recordCount) || 0,
    };
  } catch (error) {
    logger.error("Error getting aggregated request stats:", error);
    return {
      totalRequests: 0,
      filteredRequests: 0,
      blockedRequests: 0,
      cachedRequests: 0,
      cacheHitRate: 0,
      avgResponseTime: 0,
      p95ResponseTime: 0,
      minResponseTime: 0,
      daysWithData: 0,
    };
  }
}

/**
 * Get aggregated API performance statistics from database
 */
async function getAggregatedApiStats(
  startDate: string | null,
  endDate: string | null
) {
  try {
    let query = db
      .select({
        apiType: apiPerformanceHourly.apiType,
        totalCalls: sum(apiPerformanceHourly.totalCalls).as("total_calls"),
        totalErrors: sum(apiPerformanceHourly.errorCalls).as("total_errors"),
        avgResponseTime: avg(apiPerformanceHourly.avgResponseTimeMs).as(
          "avg_response_time"
        ),
        maxResponseTime: max(apiPerformanceHourly.avgResponseTimeMs).as(
          "max_response_time"
        ),
        hoursWithData: count().as("hours_with_data"),
      })
      .from(apiPerformanceHourly);

    // Only add date filter if dates are provided (not null)
    if (startDate && endDate) {
      const startTimestamp = new Date(`${startDate}T00:00:00Z`);
      const endTimestamp = new Date(`${endDate}T23:59:59Z`);

      query = query.where(
        and(
          gte(apiPerformanceHourly.timestamp, startTimestamp),
          lte(apiPerformanceHourly.timestamp, endTimestamp)
        )
      );
    }

    const results = await query.groupBy(apiPerformanceHourly.apiType);

    const apiStats: Record<string, any> = {};

    for (const result of results) {
      const totalCalls = Number(result.totalCalls) || 0;
      const totalErrors = Number(result.totalErrors) || 0;

      apiStats[result.apiType] = {
        calls: totalCalls,
        errors: totalErrors,
        errorRate:
          totalCalls > 0 ? Math.round((totalErrors / totalCalls) * 100) : 0,
        avgResponseTime: Math.round(Number(result.avgResponseTime) || 0),
        maxResponseTime: Number(result.maxResponseTime) || 0,
        hoursWithData: Number(result.hoursWithData) || 0,
      };
    }

    return apiStats;
  } catch (error) {
    logger.error("Error getting aggregated API stats:", error);
    return {};
  }
}

/**
 * Get aggregated content flags statistics from database
 */
async function getAggregatedFlagStats(
  startDate: string | null,
  endDate: string | null
) {
  try {
    let query = db
      .select({
        flagName: contentFlagsDaily.flagName,
        totalCount: sum(contentFlagsDaily.count).as("total_count"),
        daysActive: count().as("days_active"),
      })
      .from(contentFlagsDaily);

    // Only add date filter if dates are provided (not null)
    if (startDate && endDate) {
      query = query.where(
        and(
          gte(contentFlagsDaily.date, startDate),
          lte(contentFlagsDaily.date, endDate)
        )
      );
    }

    const results = await query
      .groupBy(contentFlagsDaily.flagName)
      .orderBy(desc(sql`total_count`));

    const flagStats: Record<string, any> = {};
    let totalFlags = 0;

    for (const result of results) {
      const count = Number(result.totalCount) || 0;
      totalFlags += count;

      flagStats[result.flagName] = {
        count,
        daysActive: Number(result.daysActive) || 0,
      };
    }

    return {
      flags: flagStats,
      totalFlags,
      uniqueFlags: Object.keys(flagStats).length,
    };
  } catch (error) {
    logger.error("Error getting aggregated flag stats:", error);
    return {
      flags: {},
      totalFlags: 0,
      uniqueFlags: 0,
    };
  }
}

/**
 * Get aggregated user activity statistics from database
 */
async function getAggregatedUserStats(
  startDate: string | null,
  endDate: string | null
) {
  try {
    let query = db
      .select({
        totalUsers: count().as("total_users"),
        totalRequests: sum(userActivityDaily.requestCount).as("total_requests"),
        totalBlocked: sum(userActivityDaily.blockedCount).as("total_blocked"),
        avgRequestsPerUser: avg(userActivityDaily.requestCount).as(
          "avg_requests_per_user"
        ),
        maxRequestsPerUser: max(userActivityDaily.requestCount).as(
          "max_requests_per_user"
        ),
      })
      .from(userActivityDaily);

    // Only add date filter if dates are provided (not null)
    if (startDate && endDate) {
      query = query.where(
        and(
          gte(userActivityDaily.date, startDate),
          lte(userActivityDaily.date, endDate)
        )
      );
    }

    const results = await query;

    const stats = results[0];
    const totalReq = Number(stats.totalRequests) || 0;
    const totalBlocked = Number(stats.totalBlocked) || 0;

    return {
      totalUsers: Number(stats.totalUsers) || 0,
      totalRequests: totalReq,
      totalBlocked: totalBlocked,
      blockRate: totalReq > 0 ? Math.round((totalBlocked / totalReq) * 100) : 0,
      avgRequestsPerUser: Math.round(Number(stats.avgRequestsPerUser) || 0),
      maxRequestsPerUser: Number(stats.maxRequestsPerUser) || 0,
    };
  } catch (error) {
    logger.error("Error getting aggregated user stats:", error);
    return {
      totalUsers: 0,
      totalRequests: 0,
      totalBlocked: 0,
      blockRate: 0,
      avgRequestsPerUser: 0,
      maxRequestsPerUser: 0,
    };
  }
}

/**
 * Get detailed time-series data for charts and graphs
 */
export async function getTimeSeriesData(
  startDate: string,
  endDate: string,
  granularity: "daily" | "hourly" = "daily"
) {
  try {
    logger.info(
      `Getting time-series data from ${startDate} to ${endDate} with ${granularity} granularity`
    );

    if (granularity === "daily") {
      return await getDailyTimeSeries(startDate, endDate);
    } else {
      return await getHourlyTimeSeries(startDate, endDate);
    }
  } catch (error) {
    logger.error("Error getting time-series data:", error);
    throw error;
  }
}

/**
 * Get daily time-series data
 */
async function getDailyTimeSeries(startDate: string, endDate: string) {
  const requestData = await db
    .select()
    .from(requestStatsDaily)
    .where(
      and(
        gte(requestStatsDaily.date, startDate),
        lte(requestStatsDaily.date, endDate)
      )
    )
    .orderBy(requestStatsDaily.date);

  return {
    granularity: "daily",
    data: requestData.map((row: any) => ({
      date: row.date,
      totalRequests: row.totalRequests,
      filteredRequests: row.filteredRequests,
      blockedRequests: row.blockedRequests,
      cachedRequests: row.cachedRequests,
      avgResponseTime: row.avgResponseTimeMs,
      p95ResponseTime: row.p95ResponseTimeMs,
    })),
  };
}

/**
 * Get hourly time-series data
 */
async function getHourlyTimeSeries(startDate: string, endDate: string) {
  const startTimestamp = new Date(`${startDate}T00:00:00Z`);
  const endTimestamp = new Date(`${endDate}T23:59:59Z`);

  const apiData = await db
    .select()
    .from(apiPerformanceHourly)
    .where(
      and(
        gte(apiPerformanceHourly.timestamp, startTimestamp),
        lte(apiPerformanceHourly.timestamp, endTimestamp)
      )
    )
    .orderBy(apiPerformanceHourly.timestamp, apiPerformanceHourly.apiType);

  return {
    granularity: "hourly",
    data: apiData.map((row: any) => ({
      timestamp: row.timestamp,
      apiType: row.apiType,
      totalCalls: row.totalCalls,
      errorCalls: row.errorCalls,
      avgResponseTime: row.avgResponseTimeMs,
    })),
  };
}
