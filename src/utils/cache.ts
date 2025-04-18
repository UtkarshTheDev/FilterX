import crypto from "crypto";
import { cacheGet, cacheSet } from "./redis";
import { config } from "../config";
import { updateCacheHitRate } from "../services/statsService";

/**
 * Generate a deterministic hash for a filter request - optimized for speed
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
  // Create a more compact cache key to reduce processing time
  // Only include essential configuration options that affect the result
  const essentialConfig = {
    allowAbuse: filterConfig.allowAbuse,
    allowPhone: filterConfig.allowPhone,
    allowEmail: filterConfig.allowEmail,
    allowPhysicalInformation: filterConfig.allowPhysicalInformation,
    allowSocialInformation: filterConfig.allowSocialInformation,
  };

  // For the oldMessages, only use the last 5 messages max to improve cache hits
  // and limit the key size (less messages means faster hash generation)
  const limitedMessages = Array.isArray(oldMessages)
    ? oldMessages
        .slice(-5)
        .map((msg) => (typeof msg === "string" ? msg : msg.text || ""))
    : [];

  // Create string to hash - simplified version
  const hashInput = JSON.stringify({
    t: text,
    c: essentialConfig,
    m: limitedMessages.length > 0 ? limitedMessages : undefined,
    i: imageHash || undefined,
  });

  // Create faster hash (MD5 is much faster than SHA-256 for caching purposes)
  return crypto.createHash("md5").update(hashInput).digest("hex");
};

/**
 * Generate a hash for an image (base64) - optimized for speed
 * @param imageBase64 Base64 encoded image
 * @returns Hash string or null if input is invalid
 */
export const generateImageHash = (imageBase64: string): string | null => {
  if (!imageBase64) return null;

  try {
    // Take only first 10000 chars of image data for faster hashing
    // (sufficient for detecting same/similar images)
    const sampleData = imageBase64.substring(0, 10000);
    return crypto.createHash("md5").update(sampleData).digest("hex");
  } catch (error) {
    console.error("Error generating image hash:", error);
    return null;
  }
};

/**
 * Check cache for a response - optimized for speed
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
      // Parse JSON asynchronously if possible
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
 * Store a response in cache - optimized for speed
 * @param cacheKey Cache key
 * @param response Response to cache
 * @param ttl Time to live in seconds
 */
export const setCachedResponse = async (
  cacheKey: string,
  response: any,
  ttl: number = config.caching.responseTTL || 3600 // Default to 1 hour
): Promise<void> => {
  try {
    // Use a longer TTL for AI-based results to maximize cache usage
    // This improves performance significantly for similar requests
    await cacheSet(cacheKey, JSON.stringify(response), ttl);
  } catch (error) {
    console.error("Error setting cached response:", error);
  }
};
