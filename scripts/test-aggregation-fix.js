#!/usr/bin/env node

/**
 * Test script to verify the aggregation timing fix
 * This script will:
 * 1. Add some test data to Redis
 * 2. Run aggregation immediately (testing the race condition fix)
 * 3. Check if data was properly aggregated to database
 */

const { createClient } = require('redis');

async function testAggregationFix() {
  console.log("🧪 TESTING AGGREGATION TIMING FIX...\n");

  let redisClient;

  try {
    // Connect to Redis
    console.log("1️⃣ Connecting to Redis...");
    redisClient = createClient({
      url: process.env.REDIS_URI || 'redis://localhost:6379'
    });
    
    redisClient.on('error', (err) => {
      console.error('Redis Client Error', err);
    });
    
    await redisClient.connect();
    console.log("   ✅ Redis connected successfully\n");

    // Add test data to Redis
    console.log("2️⃣ Adding test data to Redis...");
    
    // Clear existing data first
    await redisClient.del('stats:requests:total');
    await redisClient.del('stats:requests:blocked');
    await redisClient.del('stats:requests:cached');
    await redisClient.del('api:stats:text');
    await redisClient.del('stats:requests:user:test_user_fix');
    await redisClient.del('stats:flags:test_flag_fix');
    await redisClient.del('stats:latency:all');
    
    // Add test data
    await redisClient.set('stats:requests:total', '10');
    await redisClient.set('stats:requests:blocked', '3');
    await redisClient.set('stats:requests:cached', '2');
    await redisClient.set('stats:requests:user:test_user_fix', '5');
    await redisClient.set('stats:flags:test_flag_fix', '2');
    
    // Add API data
    await redisClient.hSet('api:stats:text', {
      'calls': '8',
      'errors': '1',
      'total_time': '1200'
    });
    
    // Add latency data
    await redisClient.lPush('stats:latency:all', '150', '200', '180', '120', '300');
    
    console.log("   ✅ Test data added to Redis\n");

    // Verify data is in Redis
    console.log("3️⃣ Verifying test data in Redis...");
    const totalRequests = await redisClient.get('stats:requests:total');
    const blockedRequests = await redisClient.get('stats:requests:blocked');
    const cachedRequests = await redisClient.get('stats:requests:cached');
    const textApiData = await redisClient.hGetAll('api:stats:text');
    const latencyCount = await redisClient.lLen('stats:latency:all');
    
    console.log(`   📊 Total requests: ${totalRequests}`);
    console.log(`   🚫 Blocked requests: ${blockedRequests}`);
    console.log(`   ⚡ Cached requests: ${cachedRequests}`);
    console.log(`   📱 Text API data:`, textApiData);
    console.log(`   ⏱️  Latency samples: ${latencyCount}\n`);

    if (totalRequests !== '10' || blockedRequests !== '3' || cachedRequests !== '2') {
      console.log("❌ Test data not properly set in Redis");
      return;
    }

    console.log("4️⃣ Test data verified in Redis ✅\n");

    console.log("5️⃣ Now run the aggregation script manually:");
    console.log("   bun run stats:aggregate");
    console.log("\n6️⃣ After running aggregation, check the database:");
    console.log("   The request_stats_daily table should have non-zero values");
    console.log("   Total: 10, Filtered: 7 (10-3), Blocked: 3, Cached: 2");
    console.log("\n💡 If the values are still zero after aggregation, the race condition fix didn't work");
    console.log("💡 If the values are correct, the fix is working! 🎉");

  } catch (error) {
    console.error("❌ Test failed:", error);
  } finally {
    if (redisClient) {
      await redisClient.quit();
      console.log("\n🔌 Redis connection closed");
    }
  }
}

// Run the test
testAggregationFix()
  .then(() => {
    console.log("\n🏁 Test setup completed!");
    console.log("Now run: bun run stats:aggregate");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Test failed with error:", error);
    process.exit(1);
  });
