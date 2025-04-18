import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { apiKeys } from "../models/schema";
import type { ApiKey, NewApiKey } from "../models/schema";
import { cacheGet, cacheSet } from "../utils/redis";
import { config } from "../config";
import bcrypt from "bcrypt";

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
 */
export const getOrCreateApiKeyByIp = async (ip: string): Promise<ApiKey> => {
  // Check cache first
  const cacheKey = `api_key:ip:${ip}`;
  const cachedApiKey = await cacheGet(cacheKey);

  if (cachedApiKey) {
    return JSON.parse(cachedApiKey);
  }

  try {
    // Check database for existing API key for this IP
    const existingKeys = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.ip, ip));

    if (existingKeys.length > 0) {
      // API key exists, update lastUsedAt
      const apiKey = existingKeys[0];
      await db
        .update(apiKeys)
        .set({ lastUsedAt: new Date() })
        .where(eq(apiKeys.id, apiKey.id));

      // Cache the result
      await cacheSet(
        cacheKey,
        JSON.stringify(apiKey),
        config.caching.apiKeyTTL
      );

      return apiKey;
    } else {
      // Create new API key
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
        // Cache the new API key
        await cacheSet(
          cacheKey,
          JSON.stringify(inserted[0]),
          config.caching.apiKeyTTL
        );

        return inserted[0];
      } else {
        throw new Error("Failed to insert new API key");
      }
    }
  } catch (error) {
    console.error("Error in getOrCreateApiKeyByIp:", error);
    throw error;
  }
};

/**
 * Validate API key
 */
export const validateApiKey = async (key: string): Promise<ApiKey | null> => {
  // Check cache first
  const cacheKey = `api_key:key:${key}`;
  const cachedApiKey = await cacheGet(cacheKey);

  if (cachedApiKey) {
    return JSON.parse(cachedApiKey);
  }

  try {
    // Check database for API key
    const keys = await db.select().from(apiKeys).where(eq(apiKeys.key, key));

    if (keys.length > 0 && keys[0].isActive) {
      // Update lastUsedAt
      await db
        .update(apiKeys)
        .set({ lastUsedAt: new Date() })
        .where(eq(apiKeys.id, keys[0].id));

      // Cache the result
      await cacheSet(
        cacheKey,
        JSON.stringify(keys[0]),
        config.caching.apiKeyTTL
      );

      return keys[0];
    }

    return null;
  } catch (error) {
    console.error("Error in validateApiKey:", error);
    return null;
  }
};

/**
 * Revoke API key
 */
export const revokeApiKey = async (key: string): Promise<boolean> => {
  try {
    await db
      .update(apiKeys)
      .set({ isActive: false })
      .where(eq(apiKeys.key, key));

    // Clear cache
    await cacheSet(`api_key:key:${key}`, "", 1); // Expires in 1 second

    return true;
  } catch (error) {
    console.error("Error in revokeApiKey:", error);
    return false;
  }
};
