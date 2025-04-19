import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { apiKeys } from "../models/schema";
import type { ApiKey, NewApiKey } from "../models/schema";
import { cacheGet, cacheSet } from "../utils/redis";
import { config } from "../config";
import bcrypt from "bcrypt";
import logger from "../utils/logger";

// In-memory cache for ultra-fast API key lookup
// This dramatically reduces authentication overhead
interface CacheEntry {
  data: ApiKey;
  expiry: number;
}

// In-memory LRU cache for API keys (limited size to prevent memory issues)
class ApiKeyMemoryCache {
  private cache: Map<string, CacheEntry> = new Map();
  private readonly maxSize: number = 1000; // Maximum number of cached keys
  private readonly defaultTTL: number; // Default TTL in milliseconds

  constructor(defaultTTLSeconds: number = 300) {
    // 5 minutes default
    this.defaultTTL = defaultTTLSeconds * 1000;

    // Log cache initialization
    logger.info(
      `Initialized API key memory cache with TTL: ${defaultTTLSeconds}s, max size: ${this.maxSize}`
    );

    // Set up periodic cleanup of expired items
    setInterval(() => this.removeExpiredItems(), 60000); // Run cleanup every minute
  }

  get(key: string): ApiKey | null {
    const entry = this.cache.get(key);

    // If no entry or expired, return null
    if (!entry || entry.expiry < Date.now()) {
      if (entry) {
        // Remove expired entry
        this.cache.delete(key);
        logger.debug(
          `Memory cache: expired API key entry removed for ${key.substring(
            0,
            8
          )}...`
        );
      }
      return null;
    }

    // Valid entry found - move to the end of Map to implement LRU behavior
    this.cache.delete(key);
    this.cache.set(key, entry);

    logger.debug(`Memory cache HIT for API key: ${key.substring(0, 8)}...`);
    return entry.data;
  }

  set(key: string, value: ApiKey, ttlMs?: number): void {
    // If cache is at capacity, remove the oldest item (first item in Map)
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
      logger.debug(
        `Memory cache: removed oldest API key entry due to capacity`
      );
    }

    // Set new entry with expiry time
    const expiryTime = Date.now() + (ttlMs || this.defaultTTL);
    this.cache.set(key, { data: value, expiry: expiryTime });
    logger.debug(
      `Memory cache SET for API key: ${key.substring(0, 8)}... (expires in ${
        (ttlMs || this.defaultTTL) / 1000
      }s)`
    );
  }

  remove(key: string): void {
    this.cache.delete(key);
    logger.debug(
      `Memory cache: manually removed API key: ${key.substring(0, 8)}...`
    );
  }

  // Utility method to remove all expired items
  private removeExpiredItems(): void {
    const now = Date.now();
    let removedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiry < now) {
        this.cache.delete(key);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      logger.debug(
        `Memory cache cleanup: removed ${removedCount} expired API key entries`
      );
    }
  }

  // Get cache stats
  getStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
    };
  }
}

// Create a singleton instance of the memory cache
const apiKeyMemoryCache = new ApiKeyMemoryCache(
  config.caching.apiKeyTTL / 2 // Half the Redis TTL for memory cache
);

/**
 * Generate a new API key
 */
const generateApiKey = (): string => {
  return randomBytes(32).toString("hex");
};

/**
 * Generate a userId from IP
 */
const generateUserIdFromIp = (ip: string): string => {
  return `user_${bcrypt.hashSync(ip, 10).replace(/[/$.]/g, "").slice(0, 32)}`;
};

/**
 * Get API key by IP, create if doesn't exist
 * Optimized with multi-layer caching
 */
export const getOrCreateApiKeyByIp = async (ip: string): Promise<ApiKey> => {
  // Generate cache keys
  const memoryCacheKey = `ip:${ip}`;
  const redisCacheKey = `api_key:ip:${ip}`;

  try {
    // Step 1: Check in-memory cache first (fastest)
    const memoryResult = apiKeyMemoryCache.get(memoryCacheKey);
    if (memoryResult) {
      logger.debug(`API key for IP ${ip} found in memory cache`);
      return memoryResult;
    }

    // Step 2: Check Redis cache next (fast)
    const cachedApiKey = await cacheGet(redisCacheKey);
    if (cachedApiKey) {
      logger.debug(`API key for IP ${ip} found in Redis cache`);
      const parsed = JSON.parse(cachedApiKey);

      // Update memory cache for future requests
      apiKeyMemoryCache.set(memoryCacheKey, parsed);

      return parsed;
    }

    // Step 3: Check database (slowest)
    logger.debug(`API key for IP ${ip} not found in cache, checking database`);
    const existingKeys = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.ip, ip));

    if (existingKeys.length > 0) {
      // API key exists, update lastUsedAt in background
      const apiKey = existingKeys[0];

      // Update in background to not slow down response
      setImmediate(async () => {
        try {
          await db
            .update(apiKeys)
            .set({ lastUsedAt: new Date() })
            .where(eq(apiKeys.id, apiKey.id));
          logger.debug(
            `Updated lastUsedAt for API key ${apiKey.key.substring(0, 8)}...`
          );
        } catch (error) {
          logger.error(`Failed to update lastUsedAt for API key: ${error}`);
        }
      });

      // Update both cache layers
      setImmediate(async () => {
        try {
          // Cache in Redis
          await cacheSet(
            redisCacheKey,
            JSON.stringify(apiKey),
            config.caching.apiKeyTTL
          );

          // Cache in memory
          apiKeyMemoryCache.set(memoryCacheKey, apiKey);

          logger.debug(`Cached API key for IP ${ip} in both layers`);
        } catch (error) {
          logger.error(`Failed to cache API key: ${error}`);
        }
      });

      return apiKey;
    } else {
      // Create new API key
      logger.info(`Creating new API key for IP ${ip}`);
      const newKey = generateApiKey();
      const userId = generateUserIdFromIp(ip);

      const newApiKey: NewApiKey = {
        key: newKey,
        ip,
        userId,
        createdAt: new Date(),
        lastUsedAt: new Date(),
        isActive: true,
      };

      const inserted = await db.insert(apiKeys).values(newApiKey).returning();

      if (inserted.length > 0) {
        const createdKey = inserted[0];

        // Update both cache layers in background
        setImmediate(async () => {
          try {
            // Cache in Redis
            await cacheSet(
              redisCacheKey,
              JSON.stringify(createdKey),
              config.caching.apiKeyTTL
            );

            // Cache in memory
            apiKeyMemoryCache.set(memoryCacheKey, createdKey);

            logger.debug(`Cached new API key for IP ${ip} in both layers`);
          } catch (error) {
            logger.error(`Failed to cache new API key: ${error}`);
          }
        });

        return createdKey;
      } else {
        throw new Error("Failed to insert new API key");
      }
    }
  } catch (error) {
    logger.error(`Error in getOrCreateApiKeyByIp: ${error}`);
    throw error;
  }
};

/**
 * Validate API key - optimized with multi-layer caching
 */
export const validateApiKey = async (key: string): Promise<ApiKey | null> => {
  // Early validation to avoid unnecessary processing
  if (!key || typeof key !== "string" || key.length < 10) {
    logger.debug("Invalid API key format, rejecting early");
    return null;
  }

  // Generate cache keys
  const memoryCacheKey = `key:${key}`;
  const redisCacheKey = `api_key:key:${key}`;

  try {
    // Step 1: Check in-memory cache first (fastest)
    const memoryResult = apiKeyMemoryCache.get(memoryCacheKey);
    if (memoryResult) {
      logger.debug(
        `API key ${key.substring(0, 8)}... validated from memory cache`
      );
      return memoryResult;
    }

    // Step 2: Check Redis cache next (fast)
    const cachedApiKey = await cacheGet(redisCacheKey);
    if (cachedApiKey) {
      logger.debug(
        `API key ${key.substring(0, 8)}... validated from Redis cache`
      );
      const parsed = JSON.parse(cachedApiKey);

      // Update memory cache for future requests
      apiKeyMemoryCache.set(memoryCacheKey, parsed);

      return parsed;
    }

    // Step 3: Check database (slowest)
    logger.debug(
      `API key ${key.substring(0, 8)}... not found in cache, checking database`
    );
    const keys = await db.select().from(apiKeys).where(eq(apiKeys.key, key));

    if (keys.length > 0 && keys[0].isActive) {
      const validKey = keys[0];

      // Update lastUsedAt in background
      setImmediate(async () => {
        try {
          await db
            .update(apiKeys)
            .set({ lastUsedAt: new Date() })
            .where(eq(apiKeys.id, validKey.id));
          logger.debug(
            `Updated lastUsedAt for API key ${key.substring(0, 8)}...`
          );
        } catch (error) {
          logger.error(`Failed to update lastUsedAt for API key: ${error}`);
        }
      });

      // Update both cache layers in background
      setImmediate(async () => {
        try {
          // Cache in Redis with configured TTL
          await cacheSet(
            redisCacheKey,
            JSON.stringify(validKey),
            config.caching.apiKeyTTL
          );

          // Cache in memory (with half the Redis TTL)
          apiKeyMemoryCache.set(memoryCacheKey, validKey);

          logger.debug(
            `Cached API key ${key.substring(0, 8)}... in both layers`
          );
        } catch (error) {
          logger.error(`Failed to cache API key: ${error}`);
        }
      });

      return validKey;
    }

    logger.debug(`API key ${key.substring(0, 8)}... is invalid or inactive`);
    return null;
  } catch (error) {
    logger.error(`Error in validateApiKey: ${error}`);
    return null;
  }
};

/**
 * Revoke API key - ensures removal from all cache layers
 */
export const revokeApiKey = async (key: string): Promise<boolean> => {
  try {
    // Update database first
    await db
      .update(apiKeys)
      .set({ isActive: false })
      .where(eq(apiKeys.key, key));

    // Clear from both cache layers
    const memoryCacheKey = `key:${key}`;
    const redisCacheKey = `api_key:key:${key}`;

    // Remove from memory cache immediately
    apiKeyMemoryCache.remove(memoryCacheKey);

    // Clear from Redis cache (set to expire almost immediately)
    await cacheSet(redisCacheKey, "", 1);

    logger.info(
      `API key ${key.substring(
        0,
        8
      )}... successfully revoked and cleared from all caches`
    );
    return true;
  } catch (error) {
    logger.error(`Error in revokeApiKey: ${error}`);
    return false;
  }
};

/**
 * Get memory cache statistics for monitoring
 */
export const getApiKeyCacheStats = (): { size: number; maxSize: number } => {
  return apiKeyMemoryCache.getStats();
};
