#!/usr/bin/env bun
import { Redis } from "ioredis";
import { config } from "../src/config";

/**
 * Test Redis connection for FilterX
 */
const testRedis = async () => {
  console.log("Testing Redis connection...");
  console.log(`Redis URL: ${config.redis.uri}`);

  try {
    // Create Redis client
    const redis = new Redis(config.redis.uri, {
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
    });

    // Test connectivity
    redis.on("connect", () => {
      console.log("✅ Successfully connected to Redis!");
    });

    redis.on("error", (err) => {
      console.error("❌ Redis connection error:", err);
      process.exit(1);
    });

    // Test set/get operations
    console.log("Setting test key...");
    await redis.set("filterx:test", "Connection successful");

    console.log("Getting test key...");
    const value = await redis.get("filterx:test");
    console.log(`Test value: ${value}`);

    // Cleanup
    await redis.del("filterx:test");
    console.log("Test key removed.");

    // Close connection
    await redis.quit();
    console.log("Redis test completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Redis test failed:", error);
    process.exit(1);
  }
};

// Run the test
testRedis();
