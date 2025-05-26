import { db } from "../db";
import { eq, and, sql } from "drizzle-orm";
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
 * STATS AGGREGATOR
 * 
 * This service aggregates stats from Redis and stores them in the database
 * with proper error handling and parallel processing for better performance.
 */

/**
 * Main aggregation function that runs all aggregation tasks
 */
export async function runStatsAggregation(): Promise<{
  success: boolean;
  results: Record<string, boolean>;
  timestamp: string;
  errors: string[];
}> {
  const startTime = Date.now();
  logger.info("🚀 Starting stats aggregation");

  const results: Record<string, boolean> = {};
  const errors: string[] = [];

  try {
    // Wait for Redis to be ready
    await waitForRedisReady();

    // Run all aggregation tasks in parallel for better performance
    const aggregationTasks = [
      { name: "requestStats", task: aggregateRequestStats() },
      { name: "apiPerformance", task: aggregateApiPerformance() },
      { name: "contentFlags", task: aggregateContentFlags() },
      { name: "userActivity", task: aggregateUserActivity() },
    ];

    // Execute all tasks and collect results
    const taskResults = await Promise.allSettled(
      aggregationTasks.map(({ task }) => task)
    );

    // Process results
    for (let i = 0; i < aggregationTasks.length; i++) {
      const taskName = aggregationTasks[i].name;
      const result = taskResults[i];

      if (result.status === "fulfilled") {
        results[taskName] = result.value;
        if (result.value) {
          logger.info(`✅ ${taskName} aggregation completed successfully`);
        } else {
          logger.warn(`⚠️ ${taskName} aggregation completed with warnings`);
        }
      } else {
        results[taskName] = false;
        const errorMsg = `${taskName} aggregation failed: ${result.reason}`;
        errors.push(errorMsg);
        logger.error(`❌ ${errorMsg}`);
      }
    }

    const allSuccessful = Object.values(results).every(Boolean);
    const duration = Date.now() - startTime;

    logger.info(
      `🏁 Stats aggregation completed in ${duration}ms. Success: ${allSuccessful}`
    );

    return {
      success: allSuccessful,
      results,
      timestamp: new Date().toISOString(),
      errors,
    };
  } catch (error) {
    const errorMsg = `Stats aggregation failed: ${error}`;
    logger.error(errorMsg);
    errors.push(errorMsg);

    return {
      success: false,
      results,
      timestamp: new Date().toISOString(),
      errors,
    };
  }
}

/**
 * Aggregate request stats from Redis to database
 */
async function aggregateRequestStats(): Promise<boolean> {
  try {
    logger.info("Aggregating request statistics");
    const today = new Date().toISOString().split("T")[0];

    // Get current incremental stats from Redis
    const [totalRequests, blockedRequests, cachedRequests] = await statsGetMulti([
      "stats:requests:total",
      "stats:requests:blocked",
      "stats:requests:cached",
    ]);

    const redisIncrements = {
      total: parseInt(totalRequests || "0", 10),
      blocked: parseInt(blockedRequests || "0", 10),
      cached: parseInt(cachedRequests || "0", 10),
    };

    const filteredIncrement = redisIncrements.total - redisIncrements.blocked;

    // Get latency stats
    const latencyStats = await getLatencyStatsFromRedis();

    logger.debug(
      `Redis increments - Total: ${redisIncrements.total}, Blocked: ${redisIncrements.blocked}, Cached: ${redisIncrements.cached}`
    );

    // Only proceed if we have data to aggregate
    if (redisIncrements.total === 0 && redisIncrements.blocked === 0 && redisIncrements.cached === 0) {
      logger.info("No request stats to aggregate from Redis");
      return true;
    }

    // Upsert to database with proper accumulation
    await db.transaction(async (tx: any) => {
      const existingRecord = await tx
        .select()
        .from(requestStatsDaily)
        .where(eq(requestStatsDaily.date, today))
        .limit(1);

      let finalStats: NewRequestStatsDaily;

      if (existingRecord.length > 0) {
        // Accumulate with existing data
        const existing = existingRecord[0];
        finalStats = {
          date: today,
          totalRequests: existing.totalRequests + redisIncrements.total,
          filteredRequests: existing.filteredRequests + filteredIncrement,
          blockedRequests: existing.blockedRequests + redisIncrements.blocked,
          cachedRequests: existing.cachedRequests + redisIncrements.cached,
          avgResponseTimeMs: latencyStats.average > 0 ? latencyStats.average : existing.avgResponseTimeMs,
          p95ResponseTimeMs: latencyStats.p95 > 0 ? latencyStats.p95 : existing.p95ResponseTimeMs,
          updatedAt: new Date(),
        };

        await tx
          .update(requestStatsDaily)
          .set(finalStats)
          .where(eq(requestStatsDaily.date, today));

        logger.info(
          `Accumulated request stats: ${existing.totalRequests} + ${redisIncrements.total} = ${finalStats.totalRequests}`
        );
      } else {
        // Insert new record
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
        logger.info(`Inserted new request stats: ${finalStats.totalRequests} total requests`);
      }
    });

    return true;
  } catch (error) {
    logger.error("Error in request stats aggregation:", error);
    return false;
  }
}

/**
 * Aggregate API performance from Redis to database
 */
async function aggregateApiPerformance(): Promise<boolean> {
  try {
    logger.info("Aggregating API performance");

    const now = new Date();
    const currentHour = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      now.getHours(),
      0, 0, 0
    );

    // Get API stats from Redis
    const textApiData = (await statsHGetAll("api:stats:text")) || {};
    const imageApiData = (await statsHGetAll("api:stats:image")) || {};

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

    // Only proceed if we have data
    if (redisIncrements.text.calls === 0 && redisIncrements.image.calls === 0) {
      logger.info("No API performance data to aggregate from Redis");
      return true;
    }

    await db.transaction(async (tx: any) => {
      // Process text API data
      if (redisIncrements.text.calls > 0) {
        await upsertApiPerformance(tx, {
          timestamp: currentHour,
          apiType: "text",
          redisIncrements: redisIncrements.text,
        });
      }

      // Process image API data
      if (redisIncrements.image.calls > 0) {
        await upsertApiPerformance(tx, {
          timestamp: currentHour,
          apiType: "image",
          redisIncrements: redisIncrements.image,
        });
      }
    });

    return true;
  } catch (error) {
    logger.error("Error in API performance aggregation:", error);
    return false;
  }
}

/**
 * Aggregate content flags from Redis to database
 */
async function aggregateContentFlags(): Promise<boolean> {
  try {
    logger.info("Aggregating content flags");
    const today = new Date().toISOString().split("T")[0];

    if (!redisClient || redisClient.status !== "ready") {
      logger.warn("Redis not available for content flags aggregation");
      return true;
    }

    // Get all flag keys
    const flagKeys = await redisClient.keys("stats:flags:*");
    if (flagKeys.length === 0) {
      logger.info("No content flags to aggregate from Redis");
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

    // Parse increments
    const redisIncrements: { flagName: string; count: number }[] = [];
    flagKeys.forEach((key, index) => {
      const flagName = key.replace("stats:flags:", "");
      const count = parseInt((results[index][1] as string) || "0", 10);
      if (count > 0) {
        redisIncrements.push({ flagName, count });
      }
    });

    if (redisIncrements.length === 0) {
      logger.info("No flag increments to process");
      return true;
    }

    // Upsert to database
    await db.transaction(async (tx: any) => {
      for (const { flagName, count } of redisIncrements) {
        const existingRecord = await tx
          .select()
          .from(contentFlagsDaily)
          .where(
            and(
              eq(contentFlagsDaily.date, today),
              eq(contentFlagsDaily.flagName, flagName)
            )
          )
          .limit(1);

        if (existingRecord.length > 0) {
          // Accumulate
          const existing = existingRecord[0];
          const finalData: NewContentFlagsDaily = {
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
        } else {
          // Insert
          const finalData: NewContentFlagsDaily = {
            date: today,
            flagName,
            count,
            updatedAt: new Date(),
          };

          await tx.insert(contentFlagsDaily).values(finalData);
        }
      }
    });

    logger.info(`Processed ${redisIncrements.length} content flags`);
    return true;
  } catch (error) {
    logger.error("Error in content flags aggregation:", error);
    return false;
  }
}

/**
 * Aggregate user activity from Redis to database
 */
async function aggregateUserActivity(): Promise<boolean> {
  try {
    logger.info("Aggregating user activity");
    const today = new Date().toISOString().split("T")[0];

    if (!redisClient || redisClient.status !== "ready") {
      logger.warn("Redis not available for user activity aggregation");
      return true;
    }

    // Get user activity keys
    const userKeys = await redisClient.keys("stats:requests:user:*");
    if (userKeys.length === 0) {
      logger.info("No user activity to aggregate from Redis");
      return true;
    }

    // Get user activity counts
    const pipeline = redisClient.pipeline();
    userKeys.forEach((key) => pipeline.get(key));
    const results = await pipeline.exec();

    if (!results) {
      logger.warn("No results from Redis pipeline for user activity");
      return false;
    }

    // Parse increments
    const redisIncrements: { userId: string; requestCount: number }[] = [];
    userKeys.forEach((key, index) => {
      const userId = key.replace("stats:requests:user:", "");
      const requestCount = parseInt((results[index][1] as string) || "0", 10);
      if (requestCount > 0) {
        redisIncrements.push({ userId, requestCount });
      }
    });

    if (redisIncrements.length === 0) {
      logger.info("No user activity increments to process");
      return true;
    }

    // Upsert to database
    await db.transaction(async (tx: any) => {
      for (const { userId, requestCount } of redisIncrements) {
        const existingRecord = await tx
          .select()
          .from(userActivityDaily)
          .where(
            and(
              eq(userActivityDaily.date, today),
              eq(userActivityDaily.userId, userId)
            )
          )
          .limit(1);

        if (existingRecord.length > 0) {
          // Accumulate
          const existing = existingRecord[0];
          const finalData: NewUserActivityDaily = {
            date: today,
            userId,
            requestCount: existing.requestCount + requestCount,
            blockedCount: existing.blockedCount,
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
        } else {
          // Insert
          const finalData: NewUserActivityDaily = {
            date: today,
            userId,
            requestCount,
            blockedCount: 0,
            updatedAt: new Date(),
          };

          await tx.insert(userActivityDaily).values(finalData);
        }
      }
    });

    logger.info(`Processed ${redisIncrements.length} user activities`);
    return true;
  } catch (error) {
    logger.error("Error in user activity aggregation:", error);
    return false;
  }
}

/**
 * Helper function to wait for Redis to be ready
 */
async function waitForRedisReady(maxWaitMs: number = 10000): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    if (redisClient && redisClient.status === "ready") {
      logger.debug("Redis is ready for aggregation");
      return;
    }

    logger.debug(`Waiting for Redis to be ready... (status: ${redisClient?.status || "null"})`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  logger.warn(`Redis not ready after ${maxWaitMs}ms, proceeding anyway`);
}

/**
 * Helper function to get latency statistics from Redis
 */
async function getLatencyStatsFromRedis() {
  try {
    const latencyValues = await statsLRange("stats:latency:all", 0, -1);

    if (latencyValues.length === 0) {
      return { average: 0, p50: 0, p95: 0, p99: 0 };
    }

    const values = latencyValues
      .map((v) => parseInt(v, 10))
      .filter((v) => !isNaN(v))
      .sort((a, b) => a - b);

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
    return { average: 0, p50: 0, p95: 0, p99: 0 };
  }
}

/**
 * Helper function to upsert API performance data
 */
async function upsertApiPerformance(
  tx: any,
  params: {
    timestamp: Date;
    apiType: string;
    redisIncrements: { calls: number; errors: number; totalTime: number };
  }
) {
  const { timestamp, apiType, redisIncrements } = params;

  const existingRecord = await tx
    .select()
    .from(apiPerformanceHourly)
    .where(
      and(
        eq(apiPerformanceHourly.timestamp, timestamp),
        eq(apiPerformanceHourly.apiType, apiType)
      )
    )
    .limit(1);

  if (existingRecord.length > 0) {
    // Accumulate
    const existing = existingRecord[0];
    const newTotalCalls = existing.totalCalls + redisIncrements.calls;
    const newErrorCalls = existing.errorCalls + redisIncrements.errors;
    const existingTotalTime = existing.avgResponseTimeMs * existing.totalCalls;
    const newTotalTime = existingTotalTime + redisIncrements.totalTime;
    const newAvgTime = newTotalCalls > 0 ? Math.round(newTotalTime / newTotalCalls) : 0;

    const finalData: NewApiPerformanceHourly = {
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
  } else {
    // Insert
    const avgTime = redisIncrements.calls > 0 
      ? Math.round(redisIncrements.totalTime / redisIncrements.calls) 
      : 0;

    const finalData: NewApiPerformanceHourly = {
      timestamp,
      apiType,
      totalCalls: redisIncrements.calls,
      errorCalls: redisIncrements.errors,
      avgResponseTimeMs: avgTime,
    };

    await tx.insert(apiPerformanceHourly).values(finalData);
  }
}
