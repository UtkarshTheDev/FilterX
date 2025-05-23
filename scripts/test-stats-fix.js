#!/usr/bin/env node

/**
 * Test script to verify that our stats tracking fixes work
 */

import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import { createClient } from 'redis';

// Load environment variables
dotenv.config();

async function testStatsFix() {
  console.log("🧪 Testing stats tracking fixes...\n");

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

    // Clear existing test data
    console.log("2️⃣ Clearing existing test data...");
    await redisClient.del('stats:requests:total');
    await redisClient.del('stats:requests:blocked');
    await redisClient.del('stats:requests:cached');
    await redisClient.del('api:stats:text');
    await redisClient.del('api:stats:image');
    await redisClient.del('stats:requests:user:test_user');
    await redisClient.del('stats:flags:test_flag');
    await redisClient.del('stats:latency:all');
    console.log("   ✅ Cleared existing test data\n");

    // Test 1: Test main request tracking
    console.log("3️⃣ Testing main request tracking...");
    
    // Simulate trackFilterRequest calls
    await redisClient.incr('stats:requests:total');
    await redisClient.incr('stats:requests:total');
    await redisClient.incr('stats:requests:total');
    
    await redisClient.incr('stats:requests:blocked');
    
    await redisClient.incr('stats:requests:cached');
    
    await redisClient.incr('stats:requests:user:test_user');
    await redisClient.incr('stats:requests:user:test_user');
    await redisClient.incr('stats:requests:user:test_user');
    
    await redisClient.incr('stats:flags:test_flag');
    
    await redisClient.lPush('stats:latency:all', ['100', '150', '200']);
    
    console.log("   ✅ Added main request tracking data");

    // Test 2: Test API performance tracking
    console.log("4️⃣ Testing API performance tracking...");
    
    // Simulate trackApiResponseTime calls
    await redisClient.hIncrBy('api:stats:text', 'calls', 2);
    await redisClient.hIncrBy('api:stats:text', 'errors', 0);
    await redisClient.hIncrBy('api:stats:text', 'total_time', 300);
    
    await redisClient.hIncrBy('api:stats:image', 'calls', 1);
    await redisClient.hIncrBy('api:stats:image', 'errors', 1);
    await redisClient.hIncrBy('api:stats:image', 'total_time', 500);
    
    console.log("   ✅ Added API performance tracking data");

    // Test 3: Verify the data is in Redis
    console.log("5️⃣ Verifying test data in Redis...");
    
    const totalRequests = await redisClient.get('stats:requests:total');
    const blockedRequests = await redisClient.get('stats:requests:blocked');
    const cachedRequests = await redisClient.get('stats:requests:cached');
    const userRequests = await redisClient.get('stats:requests:user:test_user');
    const flagCount = await redisClient.get('stats:flags:test_flag');
    const latencyCount = await redisClient.lLen('stats:latency:all');
    
    console.log(`   📊 Total requests: ${totalRequests}`);
    console.log(`   🚫 Blocked requests: ${blockedRequests}`);
    console.log(`   ⚡ Cached requests: ${cachedRequests}`);
    console.log(`   👤 User requests: ${userRequests}`);
    console.log(`   🏷️  Flag count: ${flagCount}`);
    console.log(`   ⏱️  Latency samples: ${latencyCount}`);

    const textApiData = await redisClient.hGetAll('api:stats:text');
    const imageApiData = await redisClient.hGetAll('api:stats:image');
    
    console.log(`   🔤 Text API - calls: ${textApiData.calls}, errors: ${textApiData.errors}, total_time: ${textApiData.total_time}`);
    console.log(`   🖼️  Image API - calls: ${imageApiData.calls}, errors: ${imageApiData.errors}, total_time: ${imageApiData.total_time}`);

    // Verify all data is present
    const allDataPresent = 
      totalRequests === '3' &&
      blockedRequests === '1' &&
      cachedRequests === '1' &&
      userRequests === '3' &&
      flagCount === '1' &&
      latencyCount === 3 &&
      textApiData.calls === '2' &&
      textApiData.total_time === '300' &&
      imageApiData.calls === '1' &&
      imageApiData.total_time === '500';

    if (allDataPresent) {
      console.log("\n✅ ALL TEST DATA IS CORRECTLY STORED IN REDIS!");
      console.log("🎉 The stats tracking fixes are working properly!");
      console.log("\n💡 Next steps:");
      console.log("   1. Run: npm run stats:aggregate");
      console.log("   2. Run: node scripts/check-db-stats.js");
      console.log("   3. Verify database shows non-zero values");
    } else {
      console.log("\n❌ Some test data is missing or incorrect");
      console.log("🔧 The stats tracking may still have issues");
    }

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
testStatsFix();
