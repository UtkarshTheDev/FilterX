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

  async hgetall(key: string): Promise<Record<string, string>> {
    // Get all hash fields for a key
    const result: Record<string, string> = {};
    for (const [cacheKey, item] of this.cache.entries()) {
      if (cacheKey.startsWith(`${key}:`)) {
        const field = cacheKey.substring(key.length + 1);
        if (item.expiry === null || item.expiry > Date.now()) {
          result[field] = item.value;
        }
      }
    }
    return result;
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    const listKey = `list:${key}`;
    const item = await this.get(listKey);
    if (!item) return [];

    try {
      const list = JSON.parse(item);
      if (stop === -1) {
        return list.slice(start);
      }
      return list.slice(start, stop + 1);
    } catch {
      return [];
    }
  }

  async llen(key: string): Promise<number> {
    const listKey = `list:${key}`;
    const item = await this.get(listKey);
    if (!item) return 0;

    try {
      const list = JSON.parse(item);
      return list.length;
    } catch {
      return 0;
    }
  }

  pipeline(): any {
    // Proper implementation for pipeline that queues operations
    const operations: Array<() => Promise<any>> = [];

    return {
      incr: (key: string) => {
        operations.push(() => this.incr(key));
        return this;
      },
      incrby: (key: string, increment: number) => {
        operations.push(() => this.incrby(key, increment));
        return this;
      },
      hincrby: (key: string, field: string, increment: number) => {
        operations.push(async () => {
          // Simple hash implementation for memory cache
          const hashKey = `${key}:${field}`;
          const current = await this.get(hashKey);
          const newValue = (
            parseInt(current || "0", 10) + increment
          ).toString();
          await this.set(hashKey, newValue);
          return parseInt(newValue, 10);
        });
        return this;
      },
      lpush: (key: string, value: string) => {
        operations.push(async () => {
          // Simple list implementation for memory cache
          const listKey = `list:${key}`;
          const current = await this.get(listKey);
          const list = current ? JSON.parse(current) : [];
          list.unshift(value);
          await this.set(listKey, JSON.stringify(list));
          return list.length;
        });
        return this;
      },
      ltrim: (key: string, start: number, stop: number) => {
        operations.push(async () => {
          const listKey = `list:${key}`;
          const current = await this.get(listKey);
          if (current) {
            const list = JSON.parse(current);
            const trimmed = list.slice(start, stop + 1);
            await this.set(listKey, JSON.stringify(trimmed));
          }
          return "OK";
        });
        return this;
      },
      exec: async () => {
        // Execute all queued operations
        const results = [];
        for (const operation of operations) {
          try {
            const result = await operation();
            results.push([null, result]); // [error, result] format like Redis
          } catch (error) {
            results.push([error, null]);
          }
        }
        return results;
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

// Wait for Redis to be ready before considering it available
// This fixes the race condition where isRedisAvailable is false during startup
if (redisClient) {
  // Force a connection check on startup
  redisClient
    .ping()
    .then(() => {
      logger.info("Redis startup ping successful");
      isRedisAvailable = true;
    })
    .catch((error) => {
      logger.warn(
        `Redis startup ping failed, will use memory cache: ${
          error.message || error
        }`
      );
      isRedisAvailable = false;
    });
}

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
    // Check Redis connection status based on actual client status
    if (redisClient && redisClient.status === "ready") {
      logger.debug(`Using Redis for increment: ${key} by ${increment}`);
      // Update availability flag based on actual status
      isRedisAvailable = true;

      const result = await redisClient.incrby(key, increment);

      // Set TTL if not already set (won't override existing TTL)
      await redisClient.expire(key, ttlSeconds, "NX");

      logger.debug(`Redis increment result for ${key}: ${result}`);
      return result;
    } else {
      logger.warn(
        `Redis not ready (status: ${
          redisClient?.status || "null"
        }, isRedisAvailable: ${isRedisAvailable}), using memory cache for incrby: ${key}`
      );
      // Update availability flag
      isRedisAvailable = false;
      return await memoryCache.incrby(key, increment);
    }
  } catch (error) {
    logger.error(`Error incrementing stats for key ${key}`, error);
    // Update availability flag on error
    isRedisAvailable = false;
    // Fallback to memory cache on error
    return await memoryCache.incrby(key, increment);
  }
};

export const statsGet = async (key: string): Promise<string | null> => {
  try {
    if (redisClient && redisClient.status === "ready") {
      // Update availability flag based on actual status
      isRedisAvailable = true;
      const result = await redisClient.get(key);
      logger.debug(`Redis get result for ${key}: ${result}`);
      return result;
    } else {
      logger.warn(
        `Redis not ready (status: ${
          redisClient?.status || "null"
        }, isRedisAvailable: ${isRedisAvailable}), using memory cache for get: ${key}`
      );
      // Update availability flag
      isRedisAvailable = false;
      return await memoryCache.get(key);
    }
  } catch (error) {
    logger.error(`Error getting stats for key ${key}`, error);
    // Update availability flag on error
    isRedisAvailable = false;
    // Fallback to memory cache on error
    return await memoryCache.get(key);
  }
};

export const statsGetMulti = async (
  keys: string[]
): Promise<(string | null)[]> => {
  try {
    if (redisClient && redisClient.status === "ready") {
      // Update availability flag based on actual status
      isRedisAvailable = true;
      return await redisClient.mget(keys);
    } else {
      logger.warn(
        `Redis not ready (status: ${
          redisClient?.status || "null"
        }), using memory cache for mget: ${keys.join(", ")}`
      );
      // Update availability flag
      isRedisAvailable = false;
      return await memoryCache.mget(keys);
    }
  } catch (error) {
    logger.error("Error getting multiple stats for keys", error);
    // Update availability flag on error
    isRedisAvailable = false;
    // Fallback to memory cache on error
    return await memoryCache.mget(keys);
  }
};

export const statsPipeline = () => {
  // Check if Redis client exists and is in ready state
  if (redisClient && redisClient.status === "ready") {
    logger.debug(`Using Redis for pipeline (status: ${redisClient.status})`);
    // Update the availability flag based on actual status
    isRedisAvailable = true;
    return redisClient.pipeline();
  } else {
    logger.warn(
      `Redis not ready (status: ${
        redisClient?.status || "null"
      }, isRedisAvailable: ${isRedisAvailable}), using memory cache for pipeline`
    );
    // Update the availability flag
    isRedisAvailable = false;
    return memoryCache.pipeline();
  }
};

// Helper functions for hash operations
export const statsHGetAll = async (
  key: string
): Promise<Record<string, string>> => {
  try {
    if (redisClient && redisClient.status === "ready") {
      // Update availability flag based on actual status
      isRedisAvailable = true;
      return await redisClient.hgetall(key);
    } else {
      logger.warn(
        `Redis not ready (status: ${
          redisClient?.status || "null"
        }), using memory cache for hgetall: ${key}`
      );
      // Update availability flag
      isRedisAvailable = false;
      return await memoryCache.hgetall(key);
    }
  } catch (error) {
    logger.error(`Error getting hash for key ${key}`, error);
    // Update availability flag on error
    isRedisAvailable = false;
    // Fallback to memory cache on error
    return await memoryCache.hgetall(key);
  }
};

// Helper functions for list operations
export const statsLRange = async (
  key: string,
  start: number,
  stop: number
): Promise<string[]> => {
  try {
    if (redisClient && redisClient.status === "ready") {
      // Update availability flag based on actual status
      isRedisAvailable = true;
      return await redisClient.lrange(key, start, stop);
    } else {
      logger.warn(
        `Redis not ready (status: ${
          redisClient?.status || "null"
        }), using memory cache for lrange: ${key}`
      );
      // Update availability flag
      isRedisAvailable = false;
      return await memoryCache.lrange(key, start, stop);
    }
  } catch (error) {
    logger.error(`Error getting list range for key ${key}`, error);
    // Update availability flag on error
    isRedisAvailable = false;
    // Fallback to memory cache on error
    return await memoryCache.lrange(key, start, stop);
  }
};

export const statsLLen = async (key: string): Promise<number> => {
  try {
    if (redisClient && redisClient.status === "ready") {
      // Update availability flag based on actual status
      isRedisAvailable = true;
      return await redisClient.llen(key);
    } else {
      logger.warn(
        `Redis not ready (status: ${
          redisClient?.status || "null"
        }), using memory cache for llen: ${key}`
      );
      // Update availability flag
      isRedisAvailable = false;
      return await memoryCache.llen(key);
    }
  } catch (error) {
    logger.error(`Error getting list length for key ${key}`, error);
    // Update availability flag on error
    isRedisAvailable = false;
    // Fallback to memory cache on error
    return await memoryCache.llen(key);
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
