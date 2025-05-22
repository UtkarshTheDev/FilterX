import { sql } from "drizzle-orm";
import { db } from "../index";
import logger from "../../utils/logger";

/**
 * Migration: Remove cache_hits and cache_misses fields from api_performance_hourly table
 * 
 * These fields depend on removed Redis keys (filter:cache:hits, filter:cache:misses)
 * and are no longer meaningful since cache tracking has been optimized away.
 * 
 * This migration removes only the fields that directly depend on removed Redis keys
 * while preserving all other valuable API performance metrics.
 */

export async function removeCacheFields() {
  try {
    logger.info("Starting migration: Remove cache fields from api_performance_hourly");

    // Remove cache_hits column
    await db.execute(sql`
      ALTER TABLE api_performance_hourly 
      DROP COLUMN IF EXISTS cache_hits;
    `);
    logger.info("Removed cache_hits column from api_performance_hourly");

    // Remove cache_misses column  
    await db.execute(sql`
      ALTER TABLE api_performance_hourly 
      DROP COLUMN IF EXISTS cache_misses;
    `);
    logger.info("Removed cache_misses column from api_performance_hourly");

    logger.info("Migration completed successfully: Cache fields removed");
    return true;
  } catch (error) {
    logger.error("Migration failed: Error removing cache fields", error);
    throw error;
  }
}

/**
 * Rollback function to restore cache fields (with default values)
 * Use only if you need to restore the previous schema
 */
export async function restoreCacheFields() {
  try {
    logger.info("Starting rollback: Restore cache fields to api_performance_hourly");

    // Add cache_hits column back
    await db.execute(sql`
      ALTER TABLE api_performance_hourly 
      ADD COLUMN IF NOT EXISTS cache_hits INTEGER NOT NULL DEFAULT 0;
    `);
    logger.info("Restored cache_hits column to api_performance_hourly");

    // Add cache_misses column back
    await db.execute(sql`
      ALTER TABLE api_performance_hourly 
      ADD COLUMN IF NOT EXISTS cache_misses INTEGER NOT NULL DEFAULT 0;
    `);
    logger.info("Restored cache_misses column to api_performance_hourly");

    logger.info("Rollback completed successfully: Cache fields restored");
    return true;
  } catch (error) {
    logger.error("Rollback failed: Error restoring cache fields", error);
    throw error;
  }
}

// Export for use in migration scripts
export default {
  up: removeCacheFields,
  down: restoreCacheFields,
};
