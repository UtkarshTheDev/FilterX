import { Redis } from "ioredis";
import { config } from "../config";
import logger from "./logger";

// Singleton Redis instance
let redisClientInstance: Redis | null = null;

// Track if Redis is available
let isRedisAvailable = false;

// In-memory fallback cache for when Redis is unavailable
class MemoryCacheImpl {
  private cache: Map<string, { value: string; expiry: number | null }> =
    new Map();

  async get(key: string): Promise<string | null> {
    const item = this.cache.get(key);
    if (!item) return null;

    // Check if expired
    if (item.expiry && item.expiry < Date.now()) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const expiry = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
    this.cache.set(key, { value, expiry });
  }

  async del(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async incr(key: string): Promise<number> {
    const item = await this.get(key);
    const num = item ? parseInt(item, 10) + 1 : 1;
    await this.set(key, num.toString());
    return num;
  }

  async incrby(key: string, increment: number): Promise<number> {
    const item = await this.get(key);
    const num = item ? parseInt(item, 10) + increment : increment;
    await this.set(key, num.toString());
    return num;
  }

  async mget(keys: string[]): Promise<(string | null)[]> {
    return Promise.all(keys.map((key) => this.get(key)));
  }

  pipeline(): any {
    // Simple implementation for pipeline
    return {
      get: (key: string) => this.get(key),
      set: (key: string, value: string) => this.set(key, value),
      exec: async () => {
        return []; // Return empty result for now
      },
    };
  }

  async ping(): Promise<string> {
    return "PONG";
  }
}

// Create an instance of the memory cache
const memoryCache = new MemoryCacheImpl();

/**
 * Get a singleton Redis client instance
 */
export const getRedisClient = (): Redis => {
  if (redisClientInstance) {
    return redisClientInstance;
  }

  logger.info("Initializing Redis client singleton");

  try {
    // Use Redis URI directly from config
    const redisUri = config.redis.uri;
    logger.debug(`Using Redis URI: ${redisUri.replace(/:[^:]*@/, ":****@")}`); // Log URI with hidden password

    // Create a new Redis client with correct return type handling
    redisClientInstance = new Redis(redisUri, {
      // Enhanced retry strategy
      retryStrategy: (times) => {
        if (times > 3) {
          // After 3 attempts, give up and use memory cache
          logger.warn(
            `Redis connection failed after ${times} attempts, switching to memory cache`
          );
          isRedisAvailable = false;
          return null; // Stop retrying (using null instead of false)
        }
        // Maximum backoff time of 10 seconds
        const maxBackoff = 10000;
        const delay = Math.min(times * 500, maxBackoff);
        logger.debug(
          `Redis connection attempt ${times}, retrying in ${delay}ms`
        );
        return delay;
      },
      // Set reconnect strategy
      reconnectOnError: (err) => {
        const targetErrors = [
          /READONLY/,
          /ETIMEDOUT/,
          /ECONNRESET/,
          /ECONNREFUSED/,
        ];
        const shouldReconnect = targetErrors.some((pattern) =>
          pattern.test(err.message)
        );
        if (shouldReconnect) {
          logger.warn(`Redis reconnecting due to error: ${err.message}`);
        }
        return shouldReconnect;
      },
      // Other options
      maxRetriesPerRequest: 2, // Lower value to fail faster on individual commands
      connectTimeout: 10000, // Shorter timeout for initial connection
      enableOfflineQueue: true, // Queue commands when disconnected to prevent errors
      enableAutoPipelining: false,
      lazyConnect: false, // Connect immediately
      keepAlive: 10000, // Keep alive packet every 10 seconds
    });

    // Improve connection event handling
    redisClientInstance.on("connect", () => {
      logger.info("Redis connection established successfully");
    });

    redisClientInstance.on("ready", () => {
      logger.info("Redis client ready and connected");
      isRedisAvailable = true;
    });

    redisClientInstance.on("error", (err) => {
      logger.error("Redis connection error", err);
      isRedisAvailable = false;
      // Don't crash the entire application on Redis errors
    });

    redisClientInstance.on("reconnecting", () => {
      logger.warn("Redis client reconnecting...");
    });

    redisClientInstance.on("close", () => {
      logger.warn("Redis connection closed");
      isRedisAvailable = false;
    });

    redisClientInstance.on("end", () => {
      logger.warn("Redis connection ended");
      isRedisAvailable = false;
      redisClientInstance = null; // Allow reconnection attempts
    });

    return redisClientInstance;
  } catch (error) {
    logger.error("Failed to initialize Redis client", error);
    isRedisAvailable = false;
    // Return a dummy Redis client that uses memory cache
    return null as any; // Will fall back to memory cache in helper functions
  }
};

// Get the Redis client instance - attempt to connect once on startup
const redisClient = getRedisClient();

// Helper functions that use Redis if available, otherwise use memory cache
export const cacheGet = async (key: string): Promise<string | null> => {
  try {
    if (isRedisAvailable && redisClient) {
      return await redisClient.get(key);
    } else {
      logger.debug(`Using memory cache for get: ${key}`);
      return await memoryCache.get(key);
    }
  } catch (error) {
    logger.error(`Error getting cache for key ${key}`, error);
    // Fallback to memory cache on error
    return await memoryCache.get(key);
  }
};

export const cacheSet = async (
  key: string,
  value: string,
  ttl: number = config.caching.defaultTTL
): Promise<void> => {
  try {
    if (isRedisAvailable && redisClient) {
      await redisClient.set(key, value, "EX", ttl);
    } else {
      logger.debug(`Using memory cache for set: ${key}`);
      await memoryCache.set(key, value, ttl);
    }
  } catch (error) {
    logger.error(`Error setting cache for key ${key}`, error);
    // Fallback to memory cache on error
    await memoryCache.set(key, value, ttl);
  }
};

export const cacheDelete = async (key: string): Promise<void> => {
  try {
    if (isRedisAvailable && redisClient) {
      await redisClient.del(key);
    } else {
      logger.debug(`Using memory cache for delete: ${key}`);
      await memoryCache.del(key);
    }
  } catch (error) {
    logger.error(`Error deleting cache for key ${key}`, error);
    // Fallback to memory cache on error
    await memoryCache.del(key);
  }
};

// Helper functions for stats with error handling
export const statsIncrement = async (
  key: string,
  increment: number = 1,
  ttlSeconds: number = 3600 // 1 hour default TTL for stats
): Promise<number> => {
  try {
    if (isRedisAvailable && redisClient) {
      const result = await redisClient.incrby(key, increment);

      // Set TTL if not already set (won't override existing TTL)
      await redisClient.expire(key, ttlSeconds, "NX");

      return result;
    } else {
      logger.debug(`Using memory cache for incrby: ${key}`);
      return await memoryCache.incrby(key, increment);
    }
  } catch (error) {
    logger.error(`Error incrementing stats for key ${key}`, error);
    // Fallback to memory cache on error
    return await memoryCache.incrby(key, increment);
  }
};

export const statsGet = async (key: string): Promise<string | null> => {
  try {
    if (isRedisAvailable && redisClient) {
      return await redisClient.get(key);
    } else {
      logger.debug(`Using memory cache for get: ${key}`);
      return await memoryCache.get(key);
    }
  } catch (error) {
    logger.error(`Error getting stats for key ${key}`, error);
    // Fallback to memory cache on error
    return await memoryCache.get(key);
  }
};

export const statsGetMulti = async (
  keys: string[]
): Promise<(string | null)[]> => {
  try {
    if (isRedisAvailable && redisClient) {
      return await redisClient.mget(keys);
    } else {
      logger.debug(`Using memory cache for mget: ${keys.join(", ")}`);
      return await memoryCache.mget(keys);
    }
  } catch (error) {
    logger.error("Error getting multiple stats for keys", error);
    // Fallback to memory cache on error
    return await memoryCache.mget(keys);
  }
};

export const statsPipeline = () => {
  if (isRedisAvailable && redisClient) {
    return redisClient.pipeline();
  } else {
    logger.debug(`Using memory cache for pipeline`);
    return memoryCache.pipeline();
  }
};

// Check if Redis is healthy with timeout
export const isRedisHealthy = async (): Promise<boolean> => {
  if (!redisClientInstance) {
    logger.warn("Redis client not initialized yet during health check");
    return false;
  }

  try {
    // Fast check of status flag
    if (!isRedisAvailable) {
      logger.warn("Redis is not available based on connection status");
      return false;
    }

    // Add a timeout to the ping operation
    const pingPromise = new Promise<boolean>(async (resolve) => {
      try {
        const pingResult = await redisClientInstance!.ping();
        resolve(pingResult === "PONG");
      } catch (err) {
        logger.error("Redis ping failed", err);
        resolve(false);
      }
    });

    const timeoutPromise = new Promise<boolean>((resolve) => {
      setTimeout(() => {
        logger.warn("Redis ping timed out after 2 seconds");
        resolve(false);
      }, 2000);
    });

    // Race the ping against a timeout
    const healthy = await Promise.race([pingPromise, timeoutPromise]);

    // Update status
    isRedisAvailable = healthy;
    return healthy;
  } catch (error) {
    logger.error("Redis health check failed", error);
    isRedisAvailable = false;
    return false;
  }
};

// Function to close Redis connection gracefully (for server shutdown)
export const closeRedisConnection = async (): Promise<void> => {
  if (redisClientInstance) {
    logger.info("Closing Redis connection");
    try {
      await redisClientInstance.quit();
      logger.info("Redis connection closed gracefully");
    } catch (error) {
      logger.error("Error closing Redis connection", error);
      // Force close the connection
      redisClientInstance.disconnect();
    } finally {
      redisClientInstance = null;
      isRedisAvailable = false;
    }
  }
};

// Export clients and utilities for direct access when needed
export { redisClient, isRedisAvailable };
