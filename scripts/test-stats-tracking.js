#!/usr/bin/env node

/**
 * Test script to manually add stats data to Redis and test aggregation
 */

import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import { createClient } from 'redis';

// Load environment variables
dotenv.config();

async function testStatsTracking() {
  console.log("🧪 Testing stats tracking and aggregation...\n");

  // Initialize Redis client
  const redisClient = createClient({
    url: process.env.REDIS_URI,
    socket: {
      connectTimeout: 5000,
      lazyConnect: true,
    },
  });

  try {
    // Connect to Redis
    console.log("1️⃣ Connecting to Redis...");
    await redisClient.connect();
    console.log("   ✅ Redis connected successfully\n");

    // Add test data to Redis
    console.log("2️⃣ Adding test data to Redis...");
    
    // Add main request counters
    await redisClient.set('stats:requests:total', '5');
    await redisClient.set('stats:requests:blocked', '2');
    await redisClient.set('stats:requests:cached', '1');
    console.log("   ✅ Added main request counters");

    // Add API performance data
    await redisClient.hSet('api:stats:text', {
      'calls': '3',
      'errors': '0',
      'total_time': '450'
    });
    await redisClient.hSet('api:stats:image', {
      'calls': '2',
      'errors': '1',
      'total_time': '800'
    });
    console.log("   ✅ Added API performance data");

    // Add user activity
    await redisClient.set('stats:requests:user:test_user_123', '3');
    await redisClient.set('stats:requests:user:test_user_456', '2');
    console.log("   ✅ Added user activity data");

    // Add content flags
    await redisClient.set('stats:flags:phone_number', '1');
    await redisClient.set('stats:flags:email_address', '1');
    console.log("   ✅ Added content flags");

    // Add latency data
    await redisClient.lPush('stats:latency:all', ['120', '150', '180', '200', '90']);
    console.log("   ✅ Added latency data");

    console.log("\n3️⃣ Verifying test data in Redis...");
    
    // Verify the data
    const totalRequests = await redisClient.get('stats:requests:total');
    const blockedRequests = await redisClient.get('stats:requests:blocked');
    const cachedRequests = await redisClient.get('stats:requests:cached');
    
    console.log(`   📊 Total requests: ${totalRequests}`);
    console.log(`   🚫 Blocked requests: ${blockedRequests}`);
    console.log(`   ⚡ Cached requests: ${cachedRequests}`);

    const textApiData = await redisClient.hGetAll('api:stats:text');
    const imageApiData = await redisClient.hGetAll('api:stats:image');
    
    console.log(`   🔤 Text API calls: ${textApiData.calls}, errors: ${textApiData.errors}, total_time: ${textApiData.total_time}`);
    console.log(`   🖼️  Image API calls: ${imageApiData.calls}, errors: ${imageApiData.errors}, total_time: ${imageApiData.total_time}`);

    const latencyCount = await redisClient.lLen('stats:latency:all');
    console.log(`   ⏱️  Latency samples: ${latencyCount}`);

    console.log("\n✅ Test data successfully added to Redis!");
    console.log("💡 Now run: npm run stats:aggregate");
    console.log("💡 Then run: node scripts/check-db-stats.js");

  } catch (error) {
    console.error("❌ Error in test:", error);
  } finally {
    // Close Redis connection
    if (redisClient.isOpen) {
      await redisClient.quit();
      console.log("\n🔌 Redis connection closed");
    }
  }
}

// Run the test
testStatsTracking();
