import { db } from "../db";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import {
  requestStatsDaily,
  apiPerformanceHourly,
  contentFlagsDaily,
  userActivityDaily,
  type NewRequestStatsDaily,
  type NewApiPerformanceHourly,
  type NewContentFlagsDaily,
  type NewUserActivityDaily,
} from "../models/statsSchema";
import {
  redisClient,
  statsGetMulti,
  statsHGetAll,
  statsLRange,
} from "../utils/redis";
import logger from "../utils/logger";

/**
 * Wait for Redis to be ready before proceeding with aggregation
 * This fixes the race condition where aggregation starts before Redis is connected
 */
async function waitForRedisReady(maxWaitMs: number = 10000): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    if (redisClient && redisClient.status === "ready") {
      logger.info("Redis is ready for aggregation");
      return;
    }

    logger.debug(
      `Waiting for Redis to be ready... (status: ${
        redisClient?.status || "null"
      })`
    );
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait 100ms
  }

  logger.warn(`Redis not ready after ${maxWaitMs}ms, proceeding anyway`);
}

/**
 * Aggregates request statistics from Redis and stores them in the database
 * This function is designed to be called periodically (e.g., every hour)
 * FIXED: Now properly accumulates stats instead of overwriting them
 */
export async function aggregateAndStoreRequestStats(): Promise<boolean> {
  try {
    logger.info("Starting request stats aggregation");
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD format

    // CRITICAL FIX: Wait for Redis to be ready before reading stats
    await waitForRedisReady();

    // Get current incremental stats from Redis (these are increments since last aggregation)
    const [totalRequests, blockedRequests, cachedRequests] =
      await statsGetMulti([
        "stats:requests:total",
        "stats:requests:blocked",
        "stats:requests:cached",
      ]);

    // Parse Redis incremental values
    const redisIncrements = {
      total: parseInt(totalRequests || "0", 10),
      blocked: parseInt(blockedRequests || "0", 10),
      cached: parseInt(cachedRequests || "0", 10),
    };

    // Calculate filtered requests increment (derived value)
    const filteredIncrement = redisIncrements.total - redisIncrements.blocked;

    // Get latency stats from Redis for current period
    const latencyStats = await getLatencyStatsFromRedis();

    logger.info(
      `Redis increments - Total: ${redisIncrements.total}, Blocked: ${redisIncrements.blocked}, Cached: ${redisIncrements.cached}, Filtered: ${filteredIncrement}`
    );

    // Upsert to database with proper accumulation
    await db.transaction(async (tx: any) => {
      // Check if record exists for today
      const existingRecord = await tx
        .select()
        .from(requestStatsDaily)
        .where(eq(requestStatsDaily.date, today));

      let finalStats: NewRequestStatsDaily;

      if (existingRecord.length > 0) {
        // ACCUMULATE: Add Redis increments to existing database values
        const existing = existingRecord[0];

        finalStats = {
          date: today,
          totalRequests: existing.totalRequests + redisIncrements.total,
          filteredRequests: existing.filteredRequests + filteredIncrement,
          blockedRequests: existing.blockedRequests + redisIncrements.blocked,
          cachedRequests: existing.cachedRequests + redisIncrements.cached,
          // For latency, use current period stats if we have new data, otherwise keep existing
          avgResponseTimeMs:
            latencyStats.average > 0
              ? latencyStats.average
              : existing.avgResponseTimeMs,
          p95ResponseTimeMs:
            latencyStats.p95 > 0
              ? latencyStats.p95
              : existing.p95ResponseTimeMs,
          updatedAt: new Date(),
        };

        await tx
          .update(requestStatsDaily)
          .set(finalStats)
          .where(eq(requestStatsDaily.date, today));

        logger.info(
          `ACCUMULATED request stats for ${today}: DB(${existing.totalRequests}) + Redis(${redisIncrements.total}) = ${finalStats.totalRequests}`
        );
      } else {
        // INSERT: First time for this date, use Redis values directly
        finalStats = {
          date: today,
          totalRequests: redisIncrements.total,
          filteredRequests: filteredIncrement,
          blockedRequests: redisIncrements.blocked,
          cachedRequests: redisIncrements.cached,
          avgResponseTimeMs: latencyStats.average,
          p95ResponseTimeMs: latencyStats.p95,
          updatedAt: new Date(),
        };

        await tx.insert(requestStatsDaily).values(finalStats);
        logger.info(
          `INSERTED new request stats for ${today}: Total=${finalStats.totalRequests}`
        );
      }
    });

    logger.info(
      `Successfully aggregated and stored request stats for ${today}`
    );
    return true;
  } catch (error) {
    logger.error("Error aggregating request stats:", error);
    return false;
  }
}

/**
 * Aggregates API performance metrics from Redis and stores them in the database
 * This function is designed to be called periodically (e.g., every hour)
 * FIXED: Now properly accumulates API performance stats instead of overwriting them
 */
export async function aggregateAndStoreApiPerformance(): Promise<boolean> {
  try {
    logger.info("Starting API performance aggregation");

    // CRITICAL FIX: Wait for Redis to be ready before reading stats
    await waitForRedisReady();

    // Create timestamp for current hour (zeroing minutes, seconds, ms)
    const now = new Date();
    const hourTimestamp = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      now.getHours(),
      0,
      0,
      0
    );

    // Get API stats from consolidated hashes with error handling
    let textApiData: Record<string, string> = {};
    let imageApiData: Record<string, string> = {};

    try {
      textApiData = (await statsHGetAll("api:stats:text")) || {};
      imageApiData = (await statsHGetAll("api:stats:image")) || {};
    } catch (error) {
      logger.error("Error fetching API stats from Redis:", error);
      // Continue with empty objects - will use default values
    }

    // Parse Redis incremental values (these are increments since last aggregation)
    const redisIncrements = {
      text: {
        calls: parseInt(textApiData["calls"] || "0", 10),
        errors: parseInt(textApiData["errors"] || "0", 10),
        totalTime: parseInt(textApiData["total_time"] || "0", 10),
      },
      image: {
        calls: parseInt(imageApiData["calls"] || "0", 10),
        errors: parseInt(imageApiData["errors"] || "0", 10),
        totalTime: parseInt(imageApiData["total_time"] || "0", 10),
      },
    };

    logger.info(
      `Redis increments - Text API: calls=${redisIncrements.text.calls}, errors=${redisIncrements.text.errors}, time=${redisIncrements.text.totalTime}`
    );
    logger.info(
      `Redis increments - Image API: calls=${redisIncrements.image.calls}, errors=${redisIncrements.image.errors}, time=${redisIncrements.image.totalTime}`
    );

    // Upsert to database with proper accumulation
    await db.transaction(async (tx: any) => {
      // Process text API data
      await upsertApiPerformanceWithAccumulation(tx, {
        timestamp: hourTimestamp,
        apiType: "text",
        redisIncrements: redisIncrements.text,
      });

      // Process image API data
      await upsertApiPerformanceWithAccumulation(tx, {
        timestamp: hourTimestamp,
        apiType: "image",
        redisIncrements: redisIncrements.image,
      });
    });

    logger.info(
      `Successfully aggregated and stored API performance for ${hourTimestamp.toISOString()}`
    );
    return true;
  } catch (error) {
    logger.error("Error aggregating API performance:", error);
    return false;
  }
}

/**
 * Helper function to upsert API performance data with proper accumulation
 * FIXED: Now accumulates values instead of overwriting them
 */
async function upsertApiPerformanceWithAccumulation(
  tx: any,
  params: {
    timestamp: Date;
    apiType: string;
    redisIncrements: {
      calls: number;
      errors: number;
      totalTime: number;
    };
  }
) {
  const { timestamp, apiType, redisIncrements } = params;

  // Check if record exists
  const existingRecord = await tx
    .select()
    .from(apiPerformanceHourly)
    .where(
      and(
        eq(apiPerformanceHourly.timestamp, timestamp),
        eq(apiPerformanceHourly.apiType, apiType)
      )
    );

  let finalData: NewApiPerformanceHourly;

  if (existingRecord.length > 0) {
    // ACCUMULATE: Add Redis increments to existing database values
    const existing = existingRecord[0];

    const newTotalCalls = existing.totalCalls + redisIncrements.calls;
    const newErrorCalls = existing.errorCalls + redisIncrements.errors;

    // For total time, we need to accumulate and recalculate average
    // Existing average was based on existing.totalCalls
    // We need to add the new total time and recalculate
    const existingTotalTime = existing.avgResponseTimeMs * existing.totalCalls;
    const newTotalTime = existingTotalTime + redisIncrements.totalTime;
    const newAvgTime =
      newTotalCalls > 0 ? Math.round(newTotalTime / newTotalCalls) : 0;

    finalData = {
      timestamp,
      apiType,
      totalCalls: newTotalCalls,
      errorCalls: newErrorCalls,
      avgResponseTimeMs: newAvgTime,
    };

    await tx
      .update(apiPerformanceHourly)
      .set(finalData)
      .where(
        and(
          eq(apiPerformanceHourly.timestamp, timestamp),
          eq(apiPerformanceHourly.apiType, apiType)
        )
      );

    logger.info(
      `ACCUMULATED ${apiType} API stats: DB(${existing.totalCalls}) + Redis(${redisIncrements.calls}) = ${finalData.totalCalls} calls`
    );
  } else {
    // INSERT: First time for this hour/type, use Redis values directly
    const avgTime =
      redisIncrements.calls > 0
        ? Math.round(redisIncrements.totalTime / redisIncrements.calls)
        : 0;

    finalData = {
      timestamp,
      apiType,
      totalCalls: redisIncrements.calls,
      errorCalls: redisIncrements.errors,
      avgResponseTimeMs: avgTime,
    };

    await tx.insert(apiPerformanceHourly).values(finalData);
    logger.info(
      `INSERTED new ${apiType} API stats: ${finalData.totalCalls} calls`
    );
  }
}

/**
 * Aggregates content flag statistics from Redis and stores them in the database
 * FIXED: Now properly accumulates flag counts instead of overwriting them
 */
export async function aggregateAndStoreContentFlags(): Promise<boolean> {
  try {
    logger.info("Starting content flags aggregation");
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD format

    // CRITICAL FIX: Wait for Redis to be ready before reading stats
    await waitForRedisReady();

    // Check if Redis is available
    if (!redisClient || redisClient.status !== "ready") {
      logger.warn("Redis not available for content flags aggregation");
      return true; // Return success to not block other aggregations
    }

    // Get all flag keys from Redis with error handling
    let flagKeys = [];
    try {
      flagKeys = await redisClient.keys("stats:flags:*");
    } catch (error) {
      logger.error("Error fetching flag keys from Redis:", error);
      return false;
    }

    if (flagKeys.length === 0) {
      logger.info("No content flags found in Redis");
      return true;
    }

    // Get flag counts with error handling
    let results = null;
    try {
      const pipeline = redisClient.pipeline();
      flagKeys.forEach((key) => pipeline.get(key));
      results = await pipeline.exec();
    } catch (error) {
      logger.error("Error executing Redis pipeline for flag counts:", error);
      return false;
    }

    if (!results) {
      logger.warn("No results from Redis pipeline for flag counts");
      return false;
    }

    // Parse Redis incremental values
    const redisIncrements: { flagName: string; count: number }[] = [];

    flagKeys.forEach((key, index) => {
      const flagName = key.replace("stats:flags:", "");
      const count = parseInt((results[index][1] as string) || "0", 10);

      if (count > 0) {
        redisIncrements.push({ flagName, count });
      }
    });

    logger.info(
      `Redis increments - Found ${redisIncrements.length} flags with data`
    );

    // Upsert to database with proper accumulation
    await db.transaction(async (tx: any) => {
      for (const { flagName, count } of redisIncrements) {
        // Check if record exists
        const existingRecord = await tx
          .select()
          .from(contentFlagsDaily)
          .where(
            and(
              eq(contentFlagsDaily.date, today),
              eq(contentFlagsDaily.flagName, flagName)
            )
          );

        let finalData: NewContentFlagsDaily;

        if (existingRecord.length > 0) {
          // ACCUMULATE: Add Redis increment to existing database value
          const existing = existingRecord[0];

          finalData = {
            date: today,
            flagName,
            count: existing.count + count,
            updatedAt: new Date(),
          };

          await tx
            .update(contentFlagsDaily)
            .set(finalData)
            .where(
              and(
                eq(contentFlagsDaily.date, today),
                eq(contentFlagsDaily.flagName, flagName)
              )
            );

          logger.info(
            `ACCUMULATED flag ${flagName}: DB(${existing.count}) + Redis(${count}) = ${finalData.count}`
          );
        } else {
          // INSERT: First time for this flag today, use Redis value directly
          finalData = {
            date: today,
            flagName,
            count,
            updatedAt: new Date(),
          };

          await tx.insert(contentFlagsDaily).values(finalData);
          logger.info(`INSERTED new flag ${flagName}: ${finalData.count}`);
        }
      }
    });

    logger.info(
      `Successfully aggregated and stored ${redisIncrements.length} content flags for ${today}`
    );
    return true;
  } catch (error) {
    logger.error("Error aggregating content flags:", error);
    return false;
  }
}

/**
 * Aggregates user activity statistics from Redis and stores them in the database
 * FIXED: Now properly accumulates user activity instead of overwriting it
 */
export async function aggregateAndStoreUserActivity(): Promise<boolean> {
  try {
    logger.info("Starting user activity aggregation");
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD format

    // CRITICAL FIX: Wait for Redis to be ready before reading stats
    await waitForRedisReady();

    // Check if Redis is available
    if (!redisClient || redisClient.status !== "ready") {
      logger.warn("Redis not available for user activity aggregation");
      return true; // Return success to not block other aggregations
    }

    // Get all user activity keys from Redis
    let userKeys = [];
    try {
      userKeys = await redisClient.keys("stats:requests:user:*");
    } catch (error) {
      logger.error("Error fetching user activity keys from Redis:", error);
      return false;
    }

    if (userKeys.length === 0) {
      logger.info("No user activity found in Redis");
      return true;
    }

    // Get user activity counts
    let results = null;
    try {
      const pipeline = redisClient.pipeline();
      userKeys.forEach((key) => pipeline.get(key));
      results = await pipeline.exec();
    } catch (error) {
      logger.error("Error executing Redis pipeline for user activity:", error);
      return false;
    }

    if (!results) {
      logger.warn("No results from Redis pipeline for user activity");
      return false;
    }

    // Parse Redis incremental values
    const redisIncrements: { userId: string; requestCount: number }[] = [];

    userKeys.forEach((key, index) => {
      try {
        const userId = key.replace("stats:requests:user:", "");
        const requestCount = parseInt((results[index][1] as string) || "0", 10);

        if (requestCount > 0) {
          redisIncrements.push({ userId, requestCount });
        }
      } catch (error) {
        logger.error(`Error processing user activity for key ${key}:`, error);
      }
    });

    if (redisIncrements.length === 0) {
      logger.info("No valid user activity increments to store");
      return true;
    }

    logger.info(
      `Redis increments - Found ${redisIncrements.length} users with activity`
    );

    // Upsert to database with proper accumulation
    await db.transaction(async (tx: any) => {
      for (const { userId, requestCount } of redisIncrements) {
        // Check if record exists
        const existingRecord = await tx
          .select()
          .from(userActivityDaily)
          .where(
            and(
              eq(userActivityDaily.date, today),
              eq(userActivityDaily.userId, userId)
            )
          );

        let finalData: NewUserActivityDaily;

        if (existingRecord.length > 0) {
          // ACCUMULATE: Add Redis increment to existing database value
          const existing = existingRecord[0];

          finalData = {
            date: today,
            userId,
            requestCount: existing.requestCount + requestCount,
            blockedCount: existing.blockedCount, // Keep existing blocked count
            updatedAt: new Date(),
          };

          await tx
            .update(userActivityDaily)
            .set(finalData)
            .where(
              and(
                eq(userActivityDaily.date, today),
                eq(userActivityDaily.userId, userId)
              )
            );

          logger.info(
            `ACCUMULATED user ${userId}: DB(${existing.requestCount}) + Redis(${requestCount}) = ${finalData.requestCount}`
          );
        } else {
          // INSERT: First time for this user today, use Redis value directly
          finalData = {
            date: today,
            userId,
            requestCount,
            blockedCount: 0, // We don't track per-user blocked counts separately
            updatedAt: new Date(),
          };

          await tx.insert(userActivityDaily).values(finalData);
          logger.info(
            `INSERTED new user ${userId}: ${finalData.requestCount} requests`
          );
        }
      }
    });

    logger.info(
      `Successfully aggregated and stored user activity for ${redisIncrements.length} users on ${today}`
    );
    return true;
  } catch (error) {
    logger.error("Error aggregating user activity:", error);
    return false;
  }
}

/**
 * Helper function to get latency statistics from Redis
 */
async function getLatencyStatsFromRedis() {
  try {
    // CRITICAL FIX: Ensure Redis is ready before reading latency data
    await waitForRedisReady();

    // Get all latency values - with error handling for Redis connection issues
    let latencyValues: string[] = [];
    try {
      latencyValues = await statsLRange("stats:latency:all", 0, -1);
    } catch (redisError) {
      logger.error("Error retrieving latency values from Redis:", redisError);
      // Continue with empty array if Redis fails
    }

    if (latencyValues.length === 0) {
      return {
        average: 0,
        p50: 0,
        p95: 0,
        p99: 0,
      };
    }

    // Convert to numbers and sort
    const values = latencyValues
      .map((v) => parseInt(v, 10))
      .filter((v) => !isNaN(v)) // Filter out invalid values
      .sort((a, b) => a - b);

    // Calculate stats
    const average = values.reduce((a, b) => a + b, 0) / values.length;
    const p50 = values[Math.floor(values.length * 0.5)];
    const p95 = values[Math.floor(values.length * 0.95)];
    const p99 = values[Math.floor(values.length * 0.99)];

    return {
      average: Math.round(average),
      p50,
      p95,
      p99,
    };
  } catch (error) {
    logger.error("Error getting latency stats from Redis:", error);
    return {
      average: 0,
      p50: 0,
      p95: 0,
      p99: 0,
    };
  }
}
