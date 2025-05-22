#!/usr/bin/env bun
import { db, pool } from "../src/db";
import { apiKeys } from "../src/models/schema";
import { eq, sql } from "drizzle-orm";
import { randomBytes } from "crypto";
import bcrypt from "bcrypt";

/**
 * Create stats tables for storing historical statistics
 */
async function createStatsTables() {
  try {
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

    // Create user_activity_daily table
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

    return true;
  } catch (error) {
    console.error("Error creating stats tables:", error);
    throw error;
  }
}

/**
 * Remove cache fields from api_performance_hourly table (optimization)
 */
async function removeCacheFields() {
  try {
    // Remove cache_hits column
    await db.execute(sql`
      ALTER TABLE api_performance_hourly
      DROP COLUMN IF EXISTS cache_hits;
    `);

    // Remove cache_misses column
    await db.execute(sql`
      ALTER TABLE api_performance_hourly
      DROP COLUMN IF EXISTS cache_misses;
    `);

    return true;
  } catch (error) {
    console.error("Error removing cache fields:", error);
    // Don't throw error here as this is an optimization step
    return false;
  }
}

/**
 * Database preparation script for FilterX
 * This script creates initial test data, API keys, and stats tables
 */
const main = async () => {
  console.log("🚀 Preparing database with initial data and stats tables...\n");

  try {
    // Step 1: Create stats tables
    console.log("1️⃣ Creating stats tables...");
    await createStatsTables();
    console.log("✅ Stats tables created successfully\n");

    // Step 2: Remove cache fields (optimization)
    console.log("2️⃣ Optimizing stats tables...");
    await removeCacheFields();
    console.log("✅ Stats tables optimized successfully\n");

    // Step 3: Create API keys
    console.log("3️⃣ Setting up API keys...");
    const existingKeys = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.ip, "127.0.0.1"));

    if (existingKeys.length === 0) {
      console.log("   Creating test API key...");

      // Generate API key and userId
      const key = randomBytes(32).toString("hex");
      const userId = `user_${bcrypt
        .hashSync("127.0.0.1", 10)
        .replace(/[/$.]/g, "")
        .slice(0, 32)}`;

      // Insert test API key
      await db.insert(apiKeys).values({
        key,
        ip: "127.0.0.1",
        userId,
        createdAt: new Date(),
        lastUsedAt: new Date(),
        isActive: true,
      });

      console.log("   ✅ Test API key created successfully!");
      console.log(`   🔑 API Key: ${key}`);
      console.log(`   👤 User ID: ${userId}`);
    } else {
      console.log("   ✅ Test API key already exists:", existingKeys[0].key);
    }

    console.log("\n🎉 Database preparation completed successfully!");
    console.log("📊 Stats tables are ready for aggregation");
    console.log("🔑 API keys are configured");
    console.log("\n💡 Next steps:");
    console.log("   1. Run: bun run stats:aggregate");
    console.log("   2. Check results: bun run stats:check-db");
  } catch (error) {
    console.error("Database preparation error:", error);
    process.exit(1);
  } finally {
    // Close database connection
    await pool.end();
  }
};

// Run the preparation
main();
