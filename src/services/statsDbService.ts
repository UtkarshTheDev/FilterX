import { db } from "../db";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import {
  requestStatsDaily,
  apiPerformanceHourly,
  contentFlagsDaily,
  userActivityDaily,
  NewRequestStatsDaily,
  NewApiPerformanceHourly,
  NewContentFlagsDaily,
  NewUserActivityDaily,
} from "../models/statsSchema";
import { redisClient, statsGetMulti } from "../utils/redis";
import logger from "../utils/logger";

/**
 * Aggregates request statistics from Redis and stores them in the database
 * This function is designed to be called periodically (e.g., every hour)
 */
export async function aggregateAndStoreRequestStats(): Promise<boolean> {
  try {
    logger.info("Starting request stats aggregation");
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD format

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
      date: new Date(today),
      totalRequests: parseInt(totalRequests || "0", 10),
      filteredRequests: parseInt(filteredRequests || "0", 10),
      blockedRequests: parseInt(blockedRequests || "0", 10),
      cachedRequests: parseInt(cachedRequests || "0", 10),
      avgResponseTimeMs: latencyStats.average,
      p95ResponseTimeMs: latencyStats.p95,
      updatedAt: new Date(),
    };

    // Upsert to database
    await db.transaction(async (tx) => {
      // Check if record exists for today
      const existingRecord = await tx
        .select()
        .from(requestStatsDaily)
        .where(eq(requestStatsDaily.date, new Date(today)));

      if (existingRecord.length > 0) {
        // Update existing record
        await tx
          .update(requestStatsDaily)
          .set(statsData)
          .where(eq(requestStatsDaily.date, new Date(today)));

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

    // Get API stats from consolidated hashes
    const textApiData = (await redisClient.hgetall("api:stats:text")) || {};
    const imageApiData = (await redisClient.hgetall("api:stats:image")) || {};

    // We're no longer tracking detailed cache stats

    // Parse text API stats
    const textCalls = parseInt(textApiData["calls"] || "0", 10);
    const textErrors = parseInt(textApiData["errors"] || "0", 10);
    const textTotalTime = parseInt(textApiData["total_time"] || "0", 10);

    // Use default values for cache stats
    const textHits = 0;
    const textMisses = 0;

    // Parse image API stats
    const imageCalls = parseInt(imageApiData["calls"] || "0", 10);
    const imageErrors = parseInt(imageApiData["errors"] || "0", 10);
    const imageTotalTime = parseInt(imageApiData["total_time"] || "0", 10);

    // Use default values for image cache stats
    const imageHits = 0;
    const imageMisses = 0;

    // Calculate average response times
    const textAvgTime =
      textCalls > 0 ? Math.round(textTotalTime / textCalls) : 0;
    const imageAvgTime =
      imageCalls > 0 ? Math.round(imageTotalTime / imageCalls) : 0;

    // Prepare data for database
    const textApiData: NewApiPerformanceHourly = {
      timestamp: hourTimestamp,
      apiType: "text",
      totalCalls: textCalls,
      errorCalls: textErrors,
      cacheHits: textHits,
      cacheMisses: textMisses,
      avgResponseTimeMs: textAvgTime,
    };

    const imageApiData: NewApiPerformanceHourly = {
      timestamp: hourTimestamp,
      apiType: "image",
      totalCalls: imageCalls,
      errorCalls: imageErrors,
      cacheHits: imageHits,
      cacheMisses: imageMisses,
      avgResponseTimeMs: imageAvgTime,
    };

    // Upsert to database
    await db.transaction(async (tx) => {
      // Upsert text API data
      await upsertApiPerformance(tx, textApiData);

      // Upsert image API data
      await upsertApiPerformance(tx, imageApiData);
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

    // Get all flag keys from Redis
    const flagKeys = await redisClient.keys("stats:flags:*");

    if (flagKeys.length === 0) {
      logger.info("No content flags found in Redis");
      return true;
    }

    // Get flag counts
    const pipeline = redisClient.pipeline();
    flagKeys.forEach((key) => pipeline.get(key));

    const results = await pipeline.exec();
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
        date: new Date(today),
        flagName,
        count,
        updatedAt: new Date(),
      });
    });

    // Upsert to database
    await db.transaction(async (tx) => {
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
 * Helper function to get latency statistics from Redis
 */
async function getLatencyStatsFromRedis() {
  try {
    // Get all latency values - with error handling for Redis connection issues
    let latencyValues = [];
    try {
      latencyValues = await redisClient.lrange("stats:latency:all", 0, -1);
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
