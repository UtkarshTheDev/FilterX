#!/usr/bin/env bun
import {
  aggregateAndStoreRequestStats,
  aggregateAndStoreApiPerformance,
  aggregateAndStoreContentFlags,
  aggregateAndStoreUserActivity,
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

    // CRITICAL FIX: Wait for Redis to be ready before starting aggregation
    logger.info("Waiting for Redis to be ready...");
    await waitForRedisReady();

    const startTime = Date.now();

    // Run all aggregation tasks
    const requestStatsResult = await aggregateAndStoreRequestStats();
    const apiPerformanceResult = await aggregateAndStoreApiPerformance();
    const contentFlagsResult = await aggregateAndStoreContentFlags();
    const userActivityResult = await aggregateAndStoreUserActivity();

    // If all tasks succeeded and clearRedisKeys is true, clear the processed Redis keys
    if (
      requestStatsResult &&
      apiPerformanceResult &&
      contentFlagsResult &&
      userActivityResult &&
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

    // Reset request counters (using optimized key set)
    // We don't delete them completely to maintain the keys for future increments
    await resetRedisCounter("stats:requests:total");
    await resetRedisCounter("stats:requests:blocked");
    await resetRedisCounter("stats:requests:cached");

    // We're no longer using the consolidated cache hit rate hash

    // Reset API performance hashes
    await resetRedisHash("api:stats:text");
    await resetRedisHash("api:stats:image");

    // Reset AI and image stats
    await resetRedisCounter("filter:ai:called");
    await resetRedisCounter("filter:ai:blocked");
    await resetRedisCounter("filter:ai:allowed");
    await resetRedisCounter("filter:ai:errors");
    await resetRedisCounter("filter:image:called");
    await resetRedisCounter("filter:image:blocked");
    await resetRedisCounter("filter:image:allowed");
    await resetRedisCounter("filter:image:errors");

    // Reset user activity counters
    const userKeys = await redisClient.keys("stats:requests:user:*");
    for (const userKey of userKeys) {
      await resetRedisCounter(userKey);
    }
    logger.debug(`Reset ${userKeys.length} user activity counters`);

    // Delete unused keys that we want to completely remove
    // These keys are no longer needed and should be removed entirely
    const keysToDelete = [
      // Cache TTL tracking keys
      "cache:ttl:count",
      "cache:ttl:sum",

      // Filter controller keys - specific keys that need to be removed
      "filter:controller:under100ms",
      "filter:controller:under500ms",
      "filter:controller:under1000ms",
      "filter:controller:over1000ms",

      // Filter performance keys - specific keys that need to be removed
      "filter:performance:under100ms",
      "filter:performance:under500ms",
      "filter:performance:under1000ms",
      "filter:performance:over1000ms",

      // Prescreening stats keys - specific keys that need to be removed
      "filter:prescreening:allowed",
      "filter:prescreening:blocked",
      "filter:prescreening:handled",
      "stats:prescreening:allowed",
      "stats:prescreening:blocked",
      "stats:prescreening:handled",

      // Filter cache keys
      "filter:cache:hits",
      "filter:cache:misses",

      // Consolidated cache hash
      "stats:cache:unified",
    ];

    // Delete each pattern
    for (const pattern of keysToDelete) {
      try {
        // If it's a pattern with wildcard, use keys command to find matches
        if (pattern.includes("*")) {
          const matchingKeys = await redisClient.keys(pattern);
          if (matchingKeys.length > 0) {
            await redisClient.del(...matchingKeys);
            logger.debug(
              `Deleted ${matchingKeys.length} keys matching pattern: ${pattern}`
            );
          }
        } else {
          // Direct key deletion
          await redisClient.del(pattern);
          logger.debug(`Deleted key: ${pattern}`);
        }
      } catch (error) {
        logger.error(`Error deleting keys matching pattern ${pattern}:`, error);
      }
    }

    // Trim latency list but don't clear it completely to maintain recent data
    if (redisClient && redisClient.status === "ready") {
      await redisClient.ltrim("stats:latency:all", 0, 499);
      logger.debug("Trimmed latency samples list to 500 entries");
    }

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
 * Helper function to reset a Redis hash (delete and recreate empty)
 * This is used for consolidated hash keys that store multiple fields
 */
async function resetRedisHash(key: string): Promise<void> {
  try {
    // Check if Redis client is available and connected
    if (redisClient && redisClient.status === "ready") {
      // Get all fields in the hash
      const fields = await redisClient.hkeys(key);

      if (fields.length > 0) {
        // Delete the hash
        await redisClient.del(key);

        // Create an empty hash with the same fields set to 0
        const pipeline = redisClient.pipeline();
        fields.forEach((field) => {
          pipeline.hset(key, field, "0");
        });
        await pipeline.exec();

        logger.debug(
          `Reset Redis hash ${key} with ${fields.length} fields to 0`
        );
      } else {
        logger.debug(`Redis hash ${key} is empty, no reset needed`);
      }
    } else {
      logger.warn(`Skipping reset of Redis hash ${key} - Redis not ready`);
    }
  } catch (error) {
    logger.error(`Error resetting Redis hash ${key}:`, error);
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
