#!/usr/bin/env bun
import { runStatsAggregation } from "../src/workers/statsAggregator";
import logger from "../src/utils/logger";
import { closeRedisConnection } from "../src/utils/redis";
import { pool } from "../src/db";

/**
 * Script to run the stats aggregator
 */

async function main() {
  try {
    logger.info("Starting stats aggregator script");

    // Wait a short time to ensure Redis connection is established
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Run the aggregation with clearRedisKeys=true to reset counters after aggregation
    const success = await runStatsAggregation(true);

    if (success) {
      logger.info("Stats aggregation completed successfully");
    } else {
      logger.error("Stats aggregation failed");
    }

    // Close connections
    await closeRedisConnection();
    await pool.end();

    // Exit with appropriate code
    process.exit(success ? 0 : 1);
  } catch (error) {
    logger.error("Unhandled error in stats aggregator script:", error);

    // Close connections
    await closeRedisConnection();
    await pool.end();

    process.exit(1);
  }
}

// Run the script
main();
