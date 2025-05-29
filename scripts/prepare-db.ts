#!/usr/bin/env bun
import { db, pool } from "../src/db";
import { apiKeys } from "../src/models/schema";
import { eq, sql } from "drizzle-orm";
import { randomBytes } from "crypto";
import bcrypt from "bcrypt";
import { networkInterfaces } from "os";

/**
 * Get the current user's IP address
 * Prioritizes external/public IPs over local ones
 */
function getCurrentUserIP(): string {
  const interfaces = networkInterfaces();

  // Priority order: external IPv4 > local IPv4 > external IPv6 > local IPv6 > fallback
  const candidates: { ip: string; priority: number }[] = [];

  for (const interfaceName in interfaces) {
    const networkInterface = interfaces[interfaceName];
    if (!networkInterface) continue;

    for (const details of networkInterface) {
      if (details.internal) continue; // Skip internal interfaces

      if (details.family === "IPv4") {
        // IPv4 addresses get higher priority
        if (
          details.address.startsWith("192.168.") ||
          details.address.startsWith("10.") ||
          details.address.startsWith("172.")
        ) {
          candidates.push({ ip: details.address, priority: 2 }); // Local IPv4
        } else {
          candidates.push({ ip: details.address, priority: 4 }); // External IPv4
        }
      } else if (details.family === "IPv6") {
        // IPv6 addresses get lower priority
        if (
          details.address.startsWith("fe80:") ||
          details.address.startsWith("::1") ||
          details.address.startsWith("fc00:") ||
          details.address.startsWith("fd00:")
        ) {
          candidates.push({ ip: details.address, priority: 1 }); // Local IPv6
        } else {
          candidates.push({ ip: details.address, priority: 3 }); // External IPv6
        }
      }
    }
  }

  // Sort by priority (highest first) and return the best candidate
  candidates.sort((a, b) => b.priority - a.priority);

  if (candidates.length > 0) {
    return candidates[0].ip;
  }

  // Fallback to localhost if no network interfaces found
  console.warn("⚠️  Could not detect network IP, falling back to localhost");
  return "127.0.0.1";
}

/**
 * Create API keys table for authentication
 */
async function createApiKeysTable() {
  try {
    // Create api_keys table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS api_keys (
        id SERIAL PRIMARY KEY,
        key VARCHAR(64) NOT NULL UNIQUE,
        ip VARCHAR(45) NOT NULL UNIQUE,
        user_id VARCHAR(64) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        last_used_at TIMESTAMP DEFAULT NOW(),
        is_active BOOLEAN NOT NULL DEFAULT true
      );
    `);

    // Create indexes for better performance
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys(key);
      CREATE INDEX IF NOT EXISTS idx_api_keys_ip ON api_keys(ip);
      CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
      CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active);
    `);

    return true;
  } catch (error) {
    console.error("Error creating API keys table:", error);
    throw error;
  }
}

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
    // Step 1: Create API keys table
    console.log("1️⃣ Creating API keys table...");
    await createApiKeysTable();
    console.log("✅ API keys table created successfully\n");

    // Step 2: Create stats tables
    console.log("2️⃣ Creating stats tables...");
    await createStatsTables();
    console.log("✅ Stats tables created successfully\n");

    // Step 3: Remove cache fields (optimization)
    console.log("3️⃣ Optimizing stats tables...");
    await removeCacheFields();
    console.log("✅ Stats tables optimized successfully\n");

    // Step 4: Create API keys
    console.log("4️⃣ Setting up API keys...");

    // Get current user's IP address
    const currentUserIP = getCurrentUserIP();
    console.log(`   🌐 Detected current IP: ${currentUserIP}`);

    const existingKeys = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.ip, currentUserIP));

    if (existingKeys.length === 0) {
      console.log("   Creating API key for current IP...");

      // Generate API key and userId
      const key = randomBytes(32).toString("hex");
      const userId = `user_${bcrypt
        .hashSync(currentUserIP, 10)
        .replace(/[/$.]/g, "")
        .slice(0, 32)}`;

      // Insert API key for current user IP
      await db.insert(apiKeys).values({
        key,
        ip: currentUserIP,
        userId,
        createdAt: new Date(),
        lastUsedAt: new Date(),
        isActive: true,
      });

      console.log("   ✅ API key created successfully for current IP!");
      console.log(`   🔑 API Key: ${key}`);
      console.log(`   👤 User ID: ${userId}`);
      console.log(`   🌐 IP Address: ${currentUserIP}`);
    } else {
      console.log(
        "   ✅ API key already exists for current IP:",
        existingKeys[0].key
      );
      console.log(`   🌐 IP Address: ${currentUserIP}`);
    }

    // Also create a localhost key for local development if current IP is not localhost
    if (currentUserIP !== "127.0.0.1") {
      console.log(
        "\n   🏠 Creating additional localhost key for local development..."
      );

      const localhostKeys = await db
        .select()
        .from(apiKeys)
        .where(eq(apiKeys.ip, "127.0.0.1"));

      if (localhostKeys.length === 0) {
        const localhostKey = randomBytes(32).toString("hex");
        const localhostUserId = `user_${bcrypt
          .hashSync("127.0.0.1", 10)
          .replace(/[/$.]/g, "")
          .slice(0, 32)}`;

        await db.insert(apiKeys).values({
          key: localhostKey,
          ip: "127.0.0.1",
          userId: localhostUserId,
          createdAt: new Date(),
          lastUsedAt: new Date(),
          isActive: true,
        });

        console.log("   ✅ Localhost API key created successfully!");
        console.log(`   🔑 Localhost Key: ${localhostKey}`);
        console.log(`   👤 Localhost User ID: ${localhostUserId}`);
      } else {
        console.log(
          "   ✅ Localhost API key already exists:",
          localhostKeys[0].key
        );
      }
    }

    console.log("\n🎉 Database preparation completed successfully!");
    console.log("🗄️  API keys table is ready for authentication");
    console.log("📊 Stats tables are ready for aggregation");
    console.log(`🔑 API key configured for current IP: ${currentUserIP}`);
    if (currentUserIP !== "127.0.0.1") {
      console.log("🏠 Additional localhost key created for local development");
    }
    console.log("\n💡 Next steps:");
    console.log("   1. Run: bun run stats:aggregate");
    console.log("   2. Check results: bun run stats:check-db");
    console.log("   3. Test API with generated key from your current IP");
    console.log(`   4. Use IP ${currentUserIP} for production API requests`);
    if (currentUserIP !== "127.0.0.1") {
      console.log("   5. Use 127.0.0.1 for local development and testing");
    }
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
