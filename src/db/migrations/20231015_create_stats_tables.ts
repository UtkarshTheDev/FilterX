import { sql } from "drizzle-orm";
import { db } from "..";
import { logger } from "../../utils/logger";

/**
 * Migration to create stats tables for storing historical statistics
 * This moves stats data from Redis to a structured database for better
 * analytics, reliability, and long-term storage
 */
export async function createStatsTables() {
  try {
    logger.info("Starting migration: Creating stats tables");

    // Create request_stats_daily table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS request_stats_daily (
        date DATE PRIMARY KEY,
        total_requests INTEGER NOT NULL DEFAULT 0,
        filtered_requests INTEGER NOT NULL DEFAULT 0,
        blocked_requests INTEGER NOT NULL DEFAULT 0,
        cached_requests INTEGER NOT NULL DEFAULT 0,
        avg_response_time_ms INTEGER NOT NULL DEFAULT 0,
        p95_response_time_ms INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    logger.info("Created request_stats_daily table");

    // Create api_performance_hourly table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS api_performance_hourly (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMP NOT NULL,
        api_type VARCHAR(20) NOT NULL,
        total_calls INTEGER NOT NULL DEFAULT 0,
        error_calls INTEGER NOT NULL DEFAULT 0,
        cache_hits INTEGER NOT NULL DEFAULT 0,
        cache_misses INTEGER NOT NULL DEFAULT 0,
        avg_response_time_ms INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(timestamp, api_type)
      );
      
      CREATE INDEX IF NOT EXISTS idx_api_perf_timestamp ON api_performance_hourly(timestamp);
      CREATE INDEX IF NOT EXISTS idx_api_perf_type ON api_performance_hourly(api_type);
    `);
    logger.info("Created api_performance_hourly table with indexes");

    // Create content_flags_daily table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS content_flags_daily (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL,
        flag_name VARCHAR(50) NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(date, flag_name)
      );
      
      CREATE INDEX IF NOT EXISTS idx_flags_date ON content_flags_daily(date);
    `);
    logger.info("Created content_flags_daily table with index");

    // Create user_activity_daily table (for high-value users only)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_activity_daily (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL,
        user_id VARCHAR(64) NOT NULL,
        request_count INTEGER NOT NULL DEFAULT 0,
        blocked_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(date, user_id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_user_activity_date ON user_activity_daily(date);
      CREATE INDEX IF NOT EXISTS idx_user_activity_user ON user_activity_daily(user_id);
    `);
    logger.info("Created user_activity_daily table with indexes");

    logger.info("Migration completed successfully: Stats tables created");
    return true;
  } catch (error) {
    logger.error("Migration failed: Error creating stats tables", error);
    throw error;
  }
}

/**
 * Rollback function to drop the stats tables
 * Use with caution as this will delete all historical stats data
 */
export async function dropStatsTables() {
  try {
    logger.info("Starting rollback: Dropping stats tables");

    // Drop tables in reverse order of dependencies
    await db.execute(sql`DROP TABLE IF EXISTS user_activity_daily;`);
    await db.execute(sql`DROP TABLE IF EXISTS content_flags_daily;`);
    await db.execute(sql`DROP TABLE IF EXISTS api_performance_hourly;`);
    await db.execute(sql`DROP TABLE IF EXISTS request_stats_daily;`);

    logger.info("Rollback completed successfully: Stats tables dropped");
    return true;
  } catch (error) {
    logger.error("Rollback failed: Error dropping stats tables", error);
    throw error;
  }
}
