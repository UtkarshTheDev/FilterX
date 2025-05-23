#!/usr/bin/env node

/**
 * Test script to verify the actual trackFilterRequest function is working
 * This imports the actual function and tests it directly
 */

import { trackFilterRequest } from '../src/services/statsService.js';
import { createClient } from 'redis';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testActualTracking() {
  console.log("🧪 TESTING ACTUAL trackFilterRequest FUNCTION...\n");

  // Initialize Redis client for verification
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
    await redisClient.del('stats:requests:user:test_user_actual');
    await redisClient.del('stats:flags:phone_number');
    await redisClient.del('stats:flags:abusive_language');
    await redisClient.del('stats:latency:all');
    console.log("   ✅ Cleared existing test data\n");

    // Test 1: Test allowed request
    console.log("3️⃣ Testing allowed request...");
    await trackFilterRequest(
      'test_user_actual',
      false, // not blocked
      [], // no flags
      120, // 120ms latency
      false // not cached
    );
    
    // Verify data
    let totalRequests = await redisClient.get('stats:requests:total');
    let blockedRequests = await redisClient.get('stats:requests:blocked');
    let cachedRequests = await redisClient.get('stats:requests:cached');
    let userRequests = await redisClient.get('stats:requests:user:test_user_actual');
    let latencyCount = await redisClient.lLen('stats:latency:all');
    
    console.log(`   📊 After allowed request - Total: ${totalRequests}, Blocked: ${blockedRequests}, Cached: ${cachedRequests}, User: ${userRequests}, Latency samples: ${latencyCount}`);

    // Test 2: Test blocked request with flags
    console.log("\n4️⃣ Testing blocked request with flags...");
    await trackFilterRequest(
      'test_user_actual',
      true, // blocked
      ['phone_number', 'abusive_language'], // flags
      85, // 85ms latency
      false // not cached
    );
    
    // Verify data
    totalRequests = await redisClient.get('stats:requests:total');
    blockedRequests = await redisClient.get('stats:requests:blocked');
    cachedRequests = await redisClient.get('stats:requests:cached');
    userRequests = await redisClient.get('stats:requests:user:test_user_actual');
    const phoneFlag = await redisClient.get('stats:flags:phone_number');
    const abuseFlag = await redisClient.get('stats:flags:abusive_language');
    latencyCount = await redisClient.lLen('stats:latency:all');
    
    console.log(`   📊 After blocked request - Total: ${totalRequests}, Blocked: ${blockedRequests}, User: ${userRequests}`);
    console.log(`   🏷️  Flags - Phone: ${phoneFlag}, Abuse: ${abuseFlag}, Latency samples: ${latencyCount}`);

    // Test 3: Test cached request
    console.log("\n5️⃣ Testing cached request...");
    await trackFilterRequest(
      'test_user_actual',
      false, // not blocked
      [], // no flags
      15, // 15ms latency (fast due to cache)
      true // cached
    );
    
    // Verify data
    totalRequests = await redisClient.get('stats:requests:total');
    blockedRequests = await redisClient.get('stats:requests:blocked');
    cachedRequests = await redisClient.get('stats:requests:cached');
    userRequests = await redisClient.get('stats:requests:user:test_user_actual');
    latencyCount = await redisClient.lLen('stats:latency:all');
    
    console.log(`   📊 After cached request - Total: ${totalRequests}, Blocked: ${blockedRequests}, Cached: ${cachedRequests}, User: ${userRequests}, Latency samples: ${latencyCount}`);

    // Final verification
    console.log("\n6️⃣ Final verification...");
    
    const expectedTotal = 3;
    const expectedBlocked = 1;
    const expectedCached = 1;
    const expectedUser = 3;
    const expectedPhoneFlag = 1;
    const expectedAbuseFlag = 1;
    const expectedLatencySamples = 3;
    
    const actualTotal = parseInt(totalRequests || '0');
    const actualBlocked = parseInt(blockedRequests || '0');
    const actualCached = parseInt(cachedRequests || '0');
    const actualUser = parseInt(userRequests || '0');
    const actualPhoneFlag = parseInt(phoneFlag || '0');
    const actualAbuseFlag = parseInt(abuseFlag || '0');
    
    const issues = [];
    
    if (actualTotal !== expectedTotal) {
      issues.push(`❌ Total requests: expected ${expectedTotal}, got ${actualTotal}`);
    }
    if (actualBlocked !== expectedBlocked) {
      issues.push(`❌ Blocked requests: expected ${expectedBlocked}, got ${actualBlocked}`);
    }
    if (actualCached !== expectedCached) {
      issues.push(`❌ Cached requests: expected ${expectedCached}, got ${actualCached}`);
    }
    if (actualUser !== expectedUser) {
      issues.push(`❌ User requests: expected ${expectedUser}, got ${actualUser}`);
    }
    if (actualPhoneFlag !== expectedPhoneFlag) {
      issues.push(`❌ Phone flag: expected ${expectedPhoneFlag}, got ${actualPhoneFlag}`);
    }
    if (actualAbuseFlag !== expectedAbuseFlag) {
      issues.push(`❌ Abuse flag: expected ${expectedAbuseFlag}, got ${actualAbuseFlag}`);
    }
    if (latencyCount !== expectedLatencySamples) {
      issues.push(`❌ Latency samples: expected ${expectedLatencySamples}, got ${latencyCount}`);
    }
    
    if (issues.length > 0) {
      console.log("❌ Issues found:");
      issues.forEach(issue => console.log(`   ${issue}`));
      console.log("\n🔧 The trackFilterRequest function may have issues");
    } else {
      console.log("✅ ALL TESTS PASSED!");
      console.log("🎉 The trackFilterRequest function is working correctly!");
      console.log("\n💡 The issue with zero values in the database is likely:");
      console.log("   1. Stats aggregation not running");
      console.log("   2. Stats being reset before aggregation");
      console.log("   3. No actual API requests being made");
    }

    // Show current Redis state
    console.log("\n7️⃣ Current Redis state:");
    const allStatsKeys = await redisClient.keys('stats:*');
    console.log("   🔑 Stats keys:", allStatsKeys);
    
    for (const key of allStatsKeys) {
      const value = await redisClient.get(key);
      if (value !== null) {
        console.log(`   📊 ${key}: ${value}`);
      }
    }

  } catch (error) {
    console.error("❌ Error in test:", error);
    console.error("Stack trace:", error.stack);
  } finally {
    // Close Redis connection
    if (redisClient.isOpen) {
      await redisClient.quit();
      console.log("\n🔌 Redis connection closed");
    }
  }
}

// Run the test
testActualTracking()
  .then(() => {
    console.log("\n🏁 Test completed!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Test failed with error:", error);
    process.exit(1);
  });
