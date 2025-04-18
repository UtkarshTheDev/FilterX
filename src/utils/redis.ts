import { Redis } from "ioredis";
import { config } from "../config";

// Create Redis client
const redisClient = new Redis(config.redis.url, {
  password: config.redis.password,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3,
});

// Test Redis connection on startup
redisClient.on("connect", () => {
  console.log("Redis connection established successfully");
});

redisClient.on("error", (err) => {
  console.error("Redis connection error:", err);
});

// Helper functions for caching
export const cacheGet = async (key: string): Promise<string | null> => {
  return await redisClient.get(key);
};

export const cacheSet = async (
  key: string,
  value: string,
  ttl: number = config.caching.defaultTTL
): Promise<void> => {
  await redisClient.set(key, value, "EX", ttl);
};

export const cacheDelete = async (key: string): Promise<void> => {
  await redisClient.del(key);
};

// Helper functions for stats
export const statsIncrement = async (
  key: string,
  increment: number = 1
): Promise<number> => {
  return await redisClient.incrby(key, increment);
};

export const statsGet = async (key: string): Promise<string | null> => {
  return await redisClient.get(key);
};

export const statsGetMulti = async (
  keys: string[]
): Promise<(string | null)[]> => {
  return await redisClient.mget(keys);
};

export const statsPipeline = () => {
  return redisClient.pipeline();
};

// Export Redis client for direct access when needed
export { redisClient };
