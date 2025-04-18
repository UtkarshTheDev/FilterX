#!/usr/bin/env bun
import { db, pool } from "../src/db";
import { apiKeys, usageStats } from "../src/models/schema";
import { sql } from "drizzle-orm";

/**
 * Database migration script for FilterX
 * This script creates the necessary tables in the database
 */
const main = async () => {
  console.log("Running database migrations...");

  try {
    console.log("Creating tables...");

    // Create tables
    await db.execute(sql`
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      
      -- Create API keys table if it doesn't exist
      CREATE TABLE IF NOT EXISTS api_keys (
        id SERIAL PRIMARY KEY,
        key VARCHAR(64) NOT NULL UNIQUE,
        ip VARCHAR(45) NOT NULL,
        user_id VARCHAR(64) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        last_used_at TIMESTAMP DEFAULT NOW(),
        is_active BOOLEAN NOT NULL DEFAULT TRUE
      );
      
      -- Create usage stats table if it doesn't exist
      CREATE TABLE IF NOT EXISTS usage_stats (
        id SERIAL PRIMARY KEY,
        api_key_id INTEGER REFERENCES api_keys(id),
        date TIMESTAMP NOT NULL DEFAULT NOW(),
        total_requests INTEGER NOT NULL DEFAULT 0,
        blocked_requests INTEGER NOT NULL DEFAULT 0,
        cached_requests INTEGER NOT NULL DEFAULT 0,
        flags VARCHAR(1000) NOT NULL DEFAULT '{}'
      );
      
      -- Create indexes for better performance
      CREATE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys(key);
      CREATE INDEX IF NOT EXISTS idx_api_keys_ip ON api_keys(ip);
      CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
      CREATE INDEX IF NOT EXISTS idx_usage_stats_api_key_id ON usage_stats(api_key_id);
      CREATE INDEX IF NOT EXISTS idx_usage_stats_date ON usage_stats(date);
    `);

    console.log("Migrations completed successfully!");
  } catch (error) {
    console.error("Migration error:", error);
    process.exit(1);
  } finally {
    // Close database connection
    await pool.end();
  }
};

// Run the migration
main();
