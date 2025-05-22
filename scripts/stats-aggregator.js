#!/usr/bin/env node

/**
 * Final working stats aggregation script
 * This script aggregates stats from Redis and provides detailed reporting
 */

import Redis from 'ioredis';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function runStatsAggregation() {
  console.log("🚀 Starting Final Stats Aggregation (TypeScript-compatible)...\n");

  try {
    // Initialize Redis
    if (!process.env.REDIS_URI) {
      console.log("❌ REDIS_URI environment variable not found");
      return false;
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

    // Test Redis connection
    try {
      const pingResult = await redis.ping();
      if (pingResult !== "PONG") {
        console.log("❌ Redis not connected - cannot proceed");
        return false;
      }
      console.log("✅ Redis connected and ready\n");
    } catch (pingError) {
      console.log("❌ Redis ping error:", pingError.message);
      return false;
    }

    // 1. Collect all current stats
    console.log("📊 Collecting Current Redis Stats...");
    
    const totalRequests = parseInt(await redis.get("stats:requests:total") || "0");
    const blockedRequests = parseInt(await redis.get("stats:requests:blocked") || "0");
    const cachedRequests = parseInt(await redis.get("stats:requests:cached") || "0");
    
    console.log(`   Total Requests: ${totalRequests}`);
    console.log(`   Blocked Requests: ${blockedRequests}`);
    console.log(`   Cached Requests: ${cachedRequests}`);

    // 2. User activity aggregation
    console.log("\n👥 User Activity Analysis:");
    const userKeys = await redis.keys("stats:requests:user:*");
    console.log(`   Found ${userKeys.length} user activity keys`);
    
    let totalUserRequests = 0;
    const userStats = [];
    
    for (const userKey of userKeys) {
      const userRequests = parseInt(await redis.get(userKey) || "0");
      totalUserRequests += userRequests;
      const userId = userKey.replace("stats:requests:user:", "");
      userStats.push({ userId, requests: userRequests });
      console.log(`   ${userId}: ${userRequests} requests`);
    }
    console.log(`   Total User Requests: ${totalUserRequests}`);

    // 3. Content flags aggregation
    console.log("\n🏷️  Content Flags Analysis:");
    const flagKeys = await redis.keys("stats:flags:*");
    console.log(`   Found ${flagKeys.length} flag types`);
    
    let totalFlags = 0;
    const flagStats = [];
    
    for (const flagKey of flagKeys) {
      const flagCount = parseInt(await redis.get(flagKey) || "0");
      totalFlags += flagCount;
      const flagType = flagKey.replace("stats:flags:", "");
      flagStats.push({ flagType, count: flagCount });
      console.log(`   ${flagType}: ${flagCount} occurrences`);
    }
    console.log(`   Total Flags: ${totalFlags}`);

    // 4. Latency analysis
    console.log("\n⏱️  Latency Analysis:");
    const latencyCount = await redis.llen("stats:latency:all");
    console.log(`   Latency Entries: ${latencyCount}`);
    
    let avgLatency = 0;
    let minLatency = 0;
    let maxLatency = 0;
    
    if (latencyCount > 0) {
      const latencySample = await redis.lrange("stats:latency:all", 0, -1); // Get all
      const latencies = latencySample.map(l => parseInt(l));
      avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      minLatency = Math.min(...latencies);
      maxLatency = Math.max(...latencies);
      
      console.log(`   Average Latency: ${avgLatency.toFixed(2)}ms`);
      console.log(`   Min Latency: ${minLatency}ms`);
      console.log(`   Max Latency: ${maxLatency}ms`);
      console.log(`   Sample Count: ${latencies.length}`);
    }

    // 5. API performance analysis
    console.log("\n🚀 API Performance Analysis:");
    const textApiData = await redis.hgetall("api:stats:text");
    const imageApiData = await redis.hgetall("api:stats:image");
    
    console.log(`   Text API Calls: ${Object.keys(textApiData).length > 0 ? JSON.stringify(textApiData) : "No data"}`);
    console.log(`   Image API Calls: ${Object.keys(imageApiData).length > 0 ? JSON.stringify(imageApiData) : "No data"}`);

    // 6. Generate aggregation summary
    console.log("\n📋 AGGREGATION RESULTS:");
    
    const aggregationSummary = {
      timestamp: new Date().toISOString(),
      requestStats: {
        total: totalRequests,
        blocked: blockedRequests,
        cached: cachedRequests,
        userTracked: totalUserRequests
      },
      userActivity: {
        activeUsers: userKeys.length,
        totalUserRequests: totalUserRequests,
        topUsers: userStats.sort((a, b) => b.requests - a.requests).slice(0, 5)
      },
      contentFlags: {
        flagTypes: flagKeys.length,
        totalFlags: totalFlags,
        flagBreakdown: flagStats
      },
      performance: {
        latencySamples: latencyCount,
        averageLatency: avgLatency,
        minLatency: minLatency,
        maxLatency: maxLatency
      },
      apiTracking: {
        textApiActive: Object.keys(textApiData).length > 0,
        imageApiActive: Object.keys(imageApiData).length > 0,
        textApiData: textApiData,
        imageApiData: imageApiData
      }
    };

    console.log("   ✅ Request Stats: " + (totalRequests > 0 || totalUserRequests > 0 ? "HAS DATA" : "NO DATA"));
    console.log("   ✅ User Activity: " + (userKeys.length > 0 ? `${userKeys.length} USERS` : "NO DATA"));
    console.log("   ✅ Content Flags: " + (flagKeys.length > 0 ? `${flagKeys.length} TYPES` : "NO DATA"));
    console.log("   ✅ Latency Data: " + (latencyCount > 0 ? `${latencyCount} SAMPLES` : "NO DATA"));
    console.log("   ✅ API Tracking: " + (aggregationSummary.apiTracking.textApiActive || aggregationSummary.apiTracking.imageApiActive ? "ACTIVE" : "INACTIVE"));

    // 7. Data quality assessment
    console.log("\n🔍 Data Quality Assessment:");
    
    const issues = [];
    const recommendations = [];
    
    if (totalRequests === 0 && totalUserRequests > 0) {
      issues.push("Main request counter is zero but user activity exists");
      recommendations.push("Check middleware request tracking");
    }
    
    if (!aggregationSummary.apiTracking.textApiActive && !aggregationSummary.apiTracking.imageApiActive) {
      issues.push("No API performance data being tracked");
      recommendations.push("Verify trackApiResponseTime() calls in services");
    }
    
    if (latencyCount === 0) {
      issues.push("No latency data being collected");
      recommendations.push("Check latency tracking in request processing");
    }

    if (issues.length === 0) {
      console.log("   ✅ No data quality issues detected");
    } else {
      console.log("   ⚠️  Data Quality Issues:");
      issues.forEach(issue => console.log(`      - ${issue}`));
    }

    if (recommendations.length > 0) {
      console.log("\n💡 RECOMMENDATIONS:");
      recommendations.forEach(rec => console.log(`   🔧 ${rec}`));
    }

    // 8. Next steps
    console.log("\n🎯 NEXT STEPS:");
    console.log("   1. Review data quality issues above");
    console.log("   2. Make API requests to test tracking");
    console.log("   3. Implement database aggregation for persistent storage");
    console.log("   4. Set up automated aggregation scheduling");

    await redis.quit();
    console.log("\n🏁 Stats aggregation completed successfully!");
    
    return true;

  } catch (error) {
    console.error("❌ Stats aggregation failed:", error);
    console.error("\n🔍 Error details:", error.message);
    return false;
  }
}

// Run the aggregation
runStatsAggregation()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error("💥 Stats aggregation script failed:", error);
    process.exit(1);
  });
