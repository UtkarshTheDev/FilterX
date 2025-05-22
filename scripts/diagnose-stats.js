#!/usr/bin/env node

/**
 * Final working diagnostic script for stats issues
 * This script checks Redis keys, database tables, and tracking functions
 */

import Redis from 'ioredis';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function diagnoseStatsIssues() {
  console.log("🔍 DIAGNOSING STATS ISSUES (TypeScript-compatible)...\n");

  try {
    // 1. Check Redis Connection
    console.log("1️⃣ Checking Redis Connection...");
    
    if (!process.env.REDIS_URI) {
      console.log("   ❌ REDIS_URI environment variable not found");
      return;
    }

    const redis = new Redis(process.env.REDIS_URI, {
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
      connectTimeout: 10000,
    });

    // Wait for connection
    await new Promise(resolve => setTimeout(resolve, 2000));

    try {
      const pingResult = await redis.ping();
      if (pingResult === "PONG") {
        console.log("   ✅ Redis ping successful, connection working");
      } else {
        console.log("   ❌ Redis ping failed");
        return;
      }
    } catch (pingError) {
      console.log("   ❌ Redis ping error:", pingError.message);
      return;
    }

    // 2. Check Redis Keys
    console.log("\n2️⃣ Checking Redis Keys...");

    // Check main request stats keys
    const requestKeys = [
      "stats:requests:total",
      "stats:requests:blocked",
      "stats:requests:cached",
    ];

    console.log("   📊 Request Stats Keys:");
    for (const key of requestKeys) {
      const value = await redis.get(key);
      console.log(`      ${key}: ${value || "(not found)"}`);
    }

    // Check API performance hashes
    console.log("\n   📊 API Performance Hashes:");
    const textApiData = await redis.hgetall("api:stats:text");
    const imageApiData = await redis.hgetall("api:stats:image");

    console.log(
      `      api:stats:text:`,
      Object.keys(textApiData).length > 0 ? textApiData : "(empty)"
    );
    console.log(
      `      api:stats:image:`,
      Object.keys(imageApiData).length > 0 ? imageApiData : "(empty)"
    );

    // Check user activity keys
    console.log("\n   📊 User Activity Keys:");
    const userKeys = await redis.keys("stats:requests:user:*");
    console.log(`      Found ${userKeys.length} user activity keys`);
    if (userKeys.length > 0) {
      // Show first 5 user keys
      for (let i = 0; i < Math.min(5, userKeys.length); i++) {
        const value = await redis.get(userKeys[i]);
        console.log(`      ${userKeys[i]}: ${value}`);
      }
      if (userKeys.length > 5) {
        console.log(`      ... and ${userKeys.length - 5} more`);
      }
    }

    // Check flag keys
    console.log("\n   📊 Flag Keys:");
    const flagKeys = await redis.keys("stats:flags:*");
    console.log(`      Found ${flagKeys.length} flag keys`);
    if (flagKeys.length > 0) {
      for (let i = 0; i < Math.min(5, flagKeys.length); i++) {
        const value = await redis.get(flagKeys[i]);
        console.log(`      ${flagKeys[i]}: ${value}`);
      }
      if (flagKeys.length > 5) {
        console.log(`      ... and ${flagKeys.length - 5} more`);
      }
    }

    // Check latency data
    console.log("\n   📊 Latency Data:");
    const latencyCount = await redis.llen("stats:latency:all");
    console.log(`      stats:latency:all: ${latencyCount} entries`);
    if (latencyCount > 0) {
      const latencySample = await redis.lrange("stats:latency:all", 0, 4);
      console.log(`      Sample values: [${latencySample.join(", ")}]`);
    }

    // 3. Issue Analysis
    console.log("\n3️⃣ Issue Analysis...");

    const issues = [];

    // Check if API tracking is working
    if (
      Object.keys(textApiData).length === 0 &&
      Object.keys(imageApiData).length === 0
    ) {
      issues.push(
        "❌ API performance tracking not working - no data in api:stats:text or api:stats:image hashes"
      );
    }

    // Check if user activity tracking is working
    if (userKeys.length === 0) {
      issues.push(
        "❌ User activity tracking not working - no stats:requests:user:* keys found"
      );
    }

    // Check if there's a disconnect between user activity and main counters
    const totalRequests = parseInt(await redis.get("stats:requests:total") || "0");
    if (userKeys.length > 0 && totalRequests === 0) {
      issues.push(
        "❌ User activity exists but main request counters are zero - tracking disconnect"
      );
    }

    if (issues.length === 0) {
      console.log("   ✅ No obvious issues found");
    } else {
      console.log("   🚨 Issues Found:");
      issues.forEach((issue) => console.log(`      ${issue}`));
    }

    // 4. Recommendations
    console.log("\n4️⃣ Recommendations...");

    if (
      Object.keys(textApiData).length === 0 &&
      Object.keys(imageApiData).length === 0
    ) {
      console.log(
        "   💡 API tracking issue: Check if trackApiResponseTime() is being called in akashChatService.ts and moonDreamService.ts"
      );
    }

    if (userKeys.length === 0) {
      console.log(
        "   💡 User tracking issue: Check if trackFilterRequest() is being called in filterService.ts"
      );
    }

    if (userKeys.length > 0 && totalRequests === 0) {
      console.log(
        "   💡 Counter disconnect: Check if middleware is properly incrementing main request counters"
      );
    }

    // 5. Current Stats Summary
    console.log("\n5️⃣ Current Stats Summary:");
    const blockedRequests = parseInt(await redis.get("stats:requests:blocked") || "0");
    const cachedRequests = parseInt(await redis.get("stats:requests:cached") || "0");
    
    let totalUserRequests = 0;
    for (const userKey of userKeys) {
      totalUserRequests += parseInt(await redis.get(userKey) || "0");
    }

    console.log(`   📊 Total Requests (main counter): ${totalRequests}`);
    console.log(`   🚫 Blocked Requests: ${blockedRequests}`);
    console.log(`   ⚡ Cached Requests: ${cachedRequests}`);
    console.log(`   👥 User Activity: ${userKeys.length} users, ${totalUserRequests} total requests`);
    console.log(`   🏷️  Content Flags: ${flagKeys.length} types`);
    console.log(`   ⏱️  Latency Samples: ${latencyCount} entries`);

    console.log("\n🎯 Next Steps:");
    console.log("   1. Make some API requests to generate data");
    console.log("   2. Run: npm run stats:aggregate");
    console.log("   3. Re-run: npm run stats:diagnose");
    console.log("   4. Check database tables for populated data");

    await redis.quit();
    console.log("\n🏁 Diagnostic completed successfully!");

  } catch (error) {
    console.error("❌ Diagnostic failed:", error);
    console.error("\n🔍 Error details:", error.message);
  }
}

// Run the diagnostic
diagnoseStatsIssues()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Diagnostic script failed:", error);
    process.exit(1);
  });
