#!/usr/bin/env node

/**
 * Simple script to check database stats tables after aggregation
 * This verifies that stats are being properly stored in the database
 */

import pkg from "pg";
const { Pool } = pkg;
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

async function checkDatabaseStats() {
  const pool = new Pool({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432"),
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "filterx",
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
  });

  try {
    console.log("🔍 Checking database stats tables...\n");

    // Check request_stats_daily table
    console.log("1️⃣ Request Stats Daily:");
    const requestStatsResult = await pool.query(
      "SELECT * FROM request_stats_daily ORDER BY date DESC LIMIT 5"
    );
    console.log(
      `   📊 Found ${requestStatsResult.rows.length} daily request records`
    );
    if (requestStatsResult.rows.length > 0) {
      const latest = requestStatsResult.rows[0];
      console.log(`   📅 Latest record: ${latest.date}`);
      console.log(`   📈 Total requests: ${latest.total_requests}`);
      console.log(`   🚫 Blocked requests: ${latest.blocked_requests}`);
      console.log(`   ⚡ Cached requests: ${latest.cached_requests}`);
      console.log(`   ⏱️  Avg response time: ${latest.avg_response_time_ms}ms`);
    }
    console.log();

    // Check api_performance_hourly table
    console.log("2️⃣ API Performance Hourly:");
    const apiPerfResult = await pool.query(
      "SELECT * FROM api_performance_hourly ORDER BY timestamp DESC LIMIT 5"
    );
    console.log(
      `   📊 Found ${apiPerfResult.rows.length} hourly API performance records`
    );
    if (apiPerfResult.rows.length > 0) {
      const latest = apiPerfResult.rows[0];
      console.log(`   📅 Latest record: ${latest.timestamp}`);
      console.log(`   🔧 API type: ${latest.api_type}`);
      console.log(`   📞 Total calls: ${latest.total_calls}`);
      console.log(`   ❌ Error calls: ${latest.error_calls}`);
      console.log(`   ⏱️  Avg response time: ${latest.avg_response_time_ms}ms`);
    }
    console.log();

    // Check content_flags_daily table
    console.log("3️⃣ Content Flags Daily:");
    const contentFlagsResult = await pool.query(
      "SELECT * FROM content_flags_daily ORDER BY date DESC LIMIT 5"
    );
    console.log(
      `   📊 Found ${contentFlagsResult.rows.length} daily content flag records`
    );
    if (contentFlagsResult.rows.length > 0) {
      const latest = contentFlagsResult.rows[0];
      console.log(`   📅 Latest record: ${latest.date}`);
      console.log(`   🏷️  Flag name: ${latest.flag_name}`);
      console.log(`   🔢 Count: ${latest.count}`);
    }
    console.log();

    // Check user_activity_daily table
    console.log("4️⃣ User Activity Daily:");
    const userActivityResult = await pool.query(
      "SELECT * FROM user_activity_daily ORDER BY date DESC LIMIT 5"
    );
    console.log(
      `   📊 Found ${userActivityResult.rows.length} daily user activity records`
    );
    if (userActivityResult.rows.length > 0) {
      const latest = userActivityResult.rows[0];
      console.log(`   📅 Latest record: ${latest.date}`);
      console.log(`   👤 User ID: ${latest.user_id}`);
      console.log(`   📞 Request count: ${latest.request_count}`);
      console.log(`   🚫 Blocked count: ${latest.blocked_count}`);
    }
    console.log();

    // Summary
    const totalRecords =
      requestStatsResult.rows.length +
      apiPerfResult.rows.length +
      contentFlagsResult.rows.length +
      userActivityResult.rows.length;
    console.log("📋 SUMMARY:");
    console.log(`   📊 Total database records: ${totalRecords}`);
    console.log(
      `   ✅ Request stats: ${
        requestStatsResult.rows.length > 0 ? "HAS DATA" : "NO DATA"
      }`
    );
    console.log(
      `   ✅ API performance: ${
        apiPerfResult.rows.length > 0 ? "HAS DATA" : "NO DATA"
      }`
    );
    console.log(
      `   ✅ Content flags: ${
        contentFlagsResult.rows.length > 0 ? "HAS DATA" : "NO DATA"
      }`
    );
    console.log(
      `   ✅ User activity: ${
        userActivityResult.rows.length > 0 ? "HAS DATA" : "NO DATA"
      }`
    );

    if (totalRecords === 0) {
      console.log("\n⚠️  No data found in database tables!");
      console.log(
        "💡 This means stats aggregation hasn't run successfully yet."
      );
      console.log("🔧 Try running: bun run stats:aggregate");
    } else {
      console.log("\n🎉 Database contains stats data!");
      console.log("✅ Stats aggregation is working properly.");
    }
  } catch (error) {
    console.error("❌ Error checking database stats:", error);
    process.exit(1);
  } finally {
    // Close database connection
    await pool.end();
    console.log("🔌 Database connections closed");
    console.log("✨ Database check completed");
  }
}

// Run the check
checkDatabaseStats().catch((error) => {
  console.error("Unhandled error in database check:", error);
  process.exit(1);
});
