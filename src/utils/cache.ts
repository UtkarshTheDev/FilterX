import crypto from "crypto";
import { cacheGet, cacheSet } from "./redis";
import { config } from "../config";
import { updateCacheHitRate } from "../services/statsService";

/**
 * Generate a deterministic hash for a filter request
 * @param text Text to filter
 * @param config Filter configuration
 * @param oldMessages Previous messages (optional)
 * @param imageHash Image hash (optional)
 * @returns Hash string
 */
export const generateCacheKey = (
  text: string,
  filterConfig: Record<string, any>,
  oldMessages?: Array<any>,
  imageHash?: string
): string => {
  // Create string to hash
  const hashInput = JSON.stringify({
    text,
    config: filterConfig,
    oldMessages: oldMessages || [],
    imageHash: imageHash || "",
  });

  // Create SHA-256 hash
  return crypto.createHash("sha256").update(hashInput).digest("hex");
};

/**
 * Generate a hash for an image (base64)
 * @param imageBase64 Base64 encoded image
 * @returns Hash string or null if input is invalid
 */
export const generateImageHash = (imageBase64: string): string | null => {
  if (!imageBase64) return null;

  try {
    // Create hash of the image data
    return crypto.createHash("sha256").update(imageBase64).digest("hex");
  } catch (error) {
    console.error("Error generating image hash:", error);
    return null;
  }
};

/**
 * Check cache for a response
 * @param cacheKey Cache key
 * @returns Cached response or null if not found
 */
export const getCachedResponse = async (
  cacheKey: string
): Promise<any | null> => {
  try {
    const cachedData = await cacheGet(cacheKey);

    if (cachedData) {
      // Update cache hit rate statistics
      await updateCacheHitRate(true);
      return JSON.parse(cachedData);
    }

    // Update cache hit rate statistics (miss)
    await updateCacheHitRate(false);
    return null;
  } catch (error) {
    console.error("Error getting cached response:", error);
    return null;
  }
};

/**
 * Store a response in cache
 * @param cacheKey Cache key
 * @param response Response to cache
 * @param ttl Time to live in seconds
 */
export const setCachedResponse = async (
  cacheKey: string,
  response: any,
  ttl: number = config.caching.responseTTL
): Promise<void> => {
  try {
    await cacheSet(cacheKey, JSON.stringify(response), ttl);
  } catch (error) {
    console.error("Error setting cached response:", error);
  }
};
