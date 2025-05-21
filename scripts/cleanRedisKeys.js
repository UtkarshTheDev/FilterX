// Simple script to clean up Redis keys
import { createClient } from "redis";
import dotenv from "dotenv";

dotenv.config();

async function cleanRedisKeys() {
  console.log("Starting Redis key cleanup...");

  // Connect to Redis
  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
  console.log(`Connecting to Redis at ${redisUrl}`);

  const redisClient = createClient({
    url: redisUrl,
  });

  redisClient.on("error", (err) => {
    console.error("Redis error:", err);
  });

  await redisClient.connect();
  console.log("Connected to Redis");

  // Keys to delete
  const keysToDelete = [
    // Cache TTL tracking keys
    "cache:ttl:count",
    "cache:ttl:sum",

    // Filter controller keys - specific keys that need to be removed
    "filter:controller:under50ms",
    "filter:controller:under100ms",
    "filter:controller:under200ms",
    "filter:controller:over200ms",

    // Filter performance keys - specific keys that need to be removed
    "filter:performance:under100ms",
    "filter:performance:under500ms",
    "filter:performance:under1000ms",
    "filter:performance:over1000ms",

    // Prescreening stats keys - specific keys that need to be removed
    "filter:prescreening:allowed",
    "filter:prescreening:blocked",
    "filter:prescreening:handled",
    "stats:prescreening:allowed",
    "stats:prescreening:blocked",
    "stats:prescreening:handled",

    // Filter cache keys
    "filter:cache:hits",
    "filter:cache:misses",

    // Consolidated cache hash
    "stats:cache:unified",
  ];

  // Delete each key
  for (const key of keysToDelete) {
    try {
      // Check if key exists
      const exists = await redisClient.exists(key);

      if (exists) {
        await redisClient.del(key);
        console.log(`Deleted key: ${key}`);
      } else {
        console.log(`Key not found: ${key}`);
      }
    } catch (error) {
      console.error(`Error deleting key ${key}:`, error);
    }
  }

  // Check for pattern matches
  const patterns = [
    "filter:controller:*",
    "filter:performance:*",
    "filter:prescreening:*",
    "stats:prescreening:*",
  ];

  for (const pattern of patterns) {
    try {
      const keys = await redisClient.keys(pattern);

      if (keys.length > 0) {
        console.log(`Found ${keys.length} keys matching pattern: ${pattern}`);
        console.log("Keys:", keys);

        // Delete all matching keys
        for (const key of keys) {
          await redisClient.del(key);
          console.log(`Deleted key: ${key}`);
        }
      } else {
        console.log(`No keys found matching pattern: ${pattern}`);
      }
    } catch (error) {
      console.error(`Error processing pattern ${pattern}:`, error);
    }
  }

  console.log("Redis key cleanup complete");
  await redisClient.quit();
  console.log("Redis connection closed");
}

// Run the cleanup
cleanRedisKeys()
  .then(() => {
    console.log("Script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Script failed:", error);
    process.exit(1);
  });
