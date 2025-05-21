#!/usr/bin/env bun
import {
  aggregateAndStoreRequestStats,
  aggregateAndStoreApiPerformance,
  aggregateAndStoreContentFlags,
} from "../services/statsDbService";
import logger from "../utils/logger";
import { closeRedisConnection, redisClient } from "../utils/redis";
import { pool } from "../db";

/**
 * Stats aggregator worker
 *
 * This script runs periodically to:
 * 1. Aggregate stats from Redis
 * 2. Store them in the database
 * 3. Optionally clear processed Redis keys
 *
 * It can be run as a standalone process or called from the main application
 */

// Flag to track if aggregation is already running
let isAggregating = false;

/**
 * Main aggregation function that runs all aggregation tasks
 */
export async function runStatsAggregation(
  clearRedisKeys: boolean = false
): Promise<boolean> {
  // Prevent concurrent aggregation runs
  if (isAggregating) {
    logger.warn("Stats aggregation already in progress, skipping this run");
    return false;
  }

  isAggregating = true;

  try {
    logger.info("Starting stats aggregation process");
    const startTime = Date.now();

    // Run all aggregation tasks
    const requestStatsResult = await aggregateAndStoreRequestStats();
    const apiPerformanceResult = await aggregateAndStoreApiPerformance();
    const contentFlagsResult = await aggregateAndStoreContentFlags();

    // If all tasks succeeded and clearRedisKeys is true, clear the processed Redis keys
    if (
      requestStatsResult &&
      apiPerformanceResult &&
      contentFlagsResult &&
      clearRedisKeys
    ) {
      await clearProcessedRedisKeys();
    }

    const duration = Date.now() - startTime;
    logger.info(`Stats aggregation completed in ${duration}ms`);

    return true;
  } catch (error) {
    logger.error("Error during stats aggregation:", error);
    return false;
  } finally {
    isAggregating = false;
  }
}

/**
 * Clear Redis keys that have been processed and stored in the database
 * This helps keep Redis memory usage low
 *
 * Note: We don't clear all keys, only counters that have been safely stored
 */
async function clearProcessedRedisKeys(): Promise<void> {
  try {
    logger.info("Clearing processed Redis stats keys");

    // Check if Redis is available before attempting to reset counters
    if (!redisClient || redisClient.status !== "ready") {
      logger.warn("Redis not ready, skipping counter reset");
      return;
    }

    // We don't clear all keys - only reset counters to zero
    // This ensures we don't lose data if the next aggregation fails

    // Reset request counters
    // We don't delete them completely to maintain the keys for future increments
    await resetRedisCounter("stats:requests:total");
    await resetRedisCounter("stats:requests:filtered");
    await resetRedisCounter("stats:requests:blocked");
    await resetRedisCounter("stats:requests:cached");

    // Reset API performance counters
    await resetRedisCounter("ai:api:calls");
    await resetRedisCounter("ai:api:errors");
    await resetRedisCounter("ai:api:total_time");
    await resetRedisCounter("image:api:calls");
    await resetRedisCounter("image:api:errors");
    await resetRedisCounter("image:api:total_time");

    logger.info("Successfully cleared processed Redis stats keys");
  } catch (error) {
    logger.error("Error clearing processed Redis keys:", error);
  }
}

/**
 * Helper function to reset a Redis counter to zero instead of deleting it
 */
async function resetRedisCounter(key: string): Promise<void> {
  try {
    // Check if Redis client is available and connected
    if (redisClient && redisClient.status === "ready") {
      await redisClient.set(key, "0");
      logger.debug(`Reset Redis counter ${key} to 0`);
    } else {
      logger.warn(`Skipping reset of Redis counter ${key} - Redis not ready`);
    }
  } catch (error) {
    logger.error(`Error resetting Redis counter ${key}:`, error);
  }
}

/**
 * If this script is run directly (not imported), run the aggregation
 */
if (require.main === module) {
  // Run the aggregation and then exit
  runStatsAggregation(true)
    .then(async (success) => {
      // Close connections before exiting
      await closeRedisConnection();
      await pool.end();

      // Exit with appropriate code
      process.exit(success ? 0 : 1);
    })
    .catch(async (error) => {
      logger.error("Unhandled error in stats aggregation:", error);

      // Close connections before exiting
      await closeRedisConnection();
      await pool.end();

      process.exit(1);
    });
}

// Export for use in scheduled tasks
export default runStatsAggregation;
