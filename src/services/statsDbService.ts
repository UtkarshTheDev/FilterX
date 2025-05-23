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
 */
export async function aggregateAndStoreRequestStats(): Promise<boolean> {
  try {
    logger.info("Starting request stats aggregation");
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD format

    // CRITICAL FIX: Wait for Redis to be ready before reading stats
    await waitForRedisReady();

    // Get current stats from Redis (using optimized key set)
    const [totalRequests, blockedRequests, cachedRequests] =
      await statsGetMulti([
        "stats:requests:total",
        "stats:requests:blocked",
        "stats:requests:cached",
      ]);

    // Calculate filtered requests (derived value)
    const totalReq = parseInt(totalRequests || "0", 10);
    const blockedReq = parseInt(blockedRequests || "0", 10);
    const filteredRequests = (totalReq - blockedReq).toString();

    // Get latency stats from the optimized latency list
    const latencyStats = await getLatencyStatsFromRedis();

    // Prepare data for database
    const statsData: NewRequestStatsDaily = {
      date: today, // Use string format for date
      totalRequests: parseInt(totalRequests || "0", 10),
      filteredRequests: parseInt(filteredRequests || "0", 10),
      blockedRequests: parseInt(blockedRequests || "0", 10),
      cachedRequests: parseInt(cachedRequests || "0", 10),
      avgResponseTimeMs: latencyStats.average,
      p95ResponseTimeMs: latencyStats.p95,
      updatedAt: new Date(),
    };

    // Upsert to database
    await db.transaction(async (tx: any) => {
      // Check if record exists for today
      const existingRecord = await tx
        .select()
        .from(requestStatsDaily)
        .where(eq(requestStatsDaily.date, today));

      if (existingRecord.length > 0) {
        // Update existing record
        await tx
          .update(requestStatsDaily)
          .set(statsData)
          .where(eq(requestStatsDaily.date, today));

        logger.debug(`Updated request stats for ${today}`);
      } else {
        // Insert new record
        await tx.insert(requestStatsDaily).values(statsData);
        logger.debug(`Inserted new request stats for ${today}`);
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

    // Parse text API stats with safe defaults
    const textCalls = parseInt(textApiData["calls"] || "0", 10);
    const textErrors = parseInt(textApiData["errors"] || "0", 10);
    const textTotalTime = parseInt(textApiData["total_time"] || "0", 10);

    // Parse image API stats with safe defaults
    const imageCalls = parseInt(imageApiData["calls"] || "0", 10);
    const imageErrors = parseInt(imageApiData["errors"] || "0", 10);
    const imageTotalTime = parseInt(imageApiData["total_time"] || "0", 10);

    // Calculate average response times with safe division
    const textAvgTime =
      textCalls > 0 ? Math.round(textTotalTime / textCalls) : 0;
    const imageAvgTime =
      imageCalls > 0 ? Math.round(imageTotalTime / imageCalls) : 0;

    // Prepare data for database (cache fields removed)
    const textApiPerformanceData: NewApiPerformanceHourly = {
      timestamp: hourTimestamp,
      apiType: "text",
      totalCalls: textCalls,
      errorCalls: textErrors,
      avgResponseTimeMs: textAvgTime,
    };

    const imageApiPerformanceData: NewApiPerformanceHourly = {
      timestamp: hourTimestamp,
      apiType: "image",
      totalCalls: imageCalls,
      errorCalls: imageErrors,
      avgResponseTimeMs: imageAvgTime,
    };

    // Upsert to database
    await db.transaction(async (tx: any) => {
      // Upsert text API data
      await upsertApiPerformance(tx, textApiPerformanceData);

      // Upsert image API data
      await upsertApiPerformance(tx, imageApiPerformanceData);
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
 * Helper function to upsert API performance data
 */
async function upsertApiPerformance(tx: any, data: NewApiPerformanceHourly) {
  // Check if record exists
  const existingRecord = await tx
    .select()
    .from(apiPerformanceHourly)
    .where(
      and(
        eq(apiPerformanceHourly.timestamp, data.timestamp),
        eq(apiPerformanceHourly.apiType, data.apiType)
      )
    );

  if (existingRecord.length > 0) {
    // Update existing record
    await tx
      .update(apiPerformanceHourly)
      .set(data)
      .where(
        and(
          eq(apiPerformanceHourly.timestamp, data.timestamp),
          eq(apiPerformanceHourly.apiType, data.apiType)
        )
      );
  } else {
    // Insert new record
    await tx.insert(apiPerformanceHourly).values(data);
  }
}

/**
 * Aggregates content flag statistics from Redis and stores them in the database
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

    // Prepare data for database
    const flagsData: NewContentFlagsDaily[] = [];

    flagKeys.forEach((key, index) => {
      const flagName = key.replace("stats:flags:", "");
      const count = parseInt((results[index][1] as string) || "0", 10);

      flagsData.push({
        date: today, // Use string format for date
        flagName,
        count,
        updatedAt: new Date(),
      });
    });

    // Upsert to database
    await db.transaction(async (tx: any) => {
      for (const flagData of flagsData) {
        // Check if record exists
        const existingRecord = await tx
          .select()
          .from(contentFlagsDaily)
          .where(
            and(
              eq(contentFlagsDaily.date, flagData.date),
              eq(contentFlagsDaily.flagName, flagData.flagName)
            )
          );

        if (existingRecord.length > 0) {
          // Update existing record
          await tx
            .update(contentFlagsDaily)
            .set(flagData)
            .where(
              and(
                eq(contentFlagsDaily.date, flagData.date),
                eq(contentFlagsDaily.flagName, flagData.flagName)
              )
            );
        } else {
          // Insert new record
          await tx.insert(contentFlagsDaily).values(flagData);
        }
      }
    });

    logger.info(
      `Successfully aggregated and stored ${flagsData.length} content flags for ${today}`
    );
    return true;
  } catch (error) {
    logger.error("Error aggregating content flags:", error);
    return false;
  }
}

/**
 * Aggregates user activity statistics from Redis and stores them in the database
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

    // Process user activity data
    const userActivityData: NewUserActivityDaily[] = [];

    userKeys.forEach((key, index) => {
      try {
        const userId = key.replace("stats:requests:user:", "");
        const requestCount = parseInt((results[index][1] as string) || "0", 10);

        if (requestCount > 0) {
          userActivityData.push({
            date: today,
            userId,
            requestCount,
            blockedCount: 0, // We don't track per-user blocked counts separately
            updatedAt: new Date(),
          });
        }
      } catch (error) {
        logger.error(`Error processing user activity for key ${key}:`, error);
      }
    });

    if (userActivityData.length === 0) {
      logger.info("No valid user activity data to store");
      return true;
    }

    // Upsert to database
    await db.transaction(async (tx: any) => {
      for (const userData of userActivityData) {
        // Check if record exists
        const existingRecord = await tx
          .select()
          .from(userActivityDaily)
          .where(
            and(
              eq(userActivityDaily.date, userData.date),
              eq(userActivityDaily.userId, userData.userId)
            )
          );

        if (existingRecord.length > 0) {
          // Update existing record
          await tx
            .update(userActivityDaily)
            .set(userData)
            .where(
              and(
                eq(userActivityDaily.date, userData.date),
                eq(userActivityDaily.userId, userData.userId)
              )
            );
        } else {
          // Insert new record
          await tx.insert(userActivityDaily).values(userData);
        }
      }
    });

    logger.info(
      `Successfully aggregated and stored user activity for ${userActivityData.length} users on ${today}`
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
