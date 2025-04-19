import crypto from "crypto";
import { cacheGet, cacheSet } from "./redis";
import { config } from "../config";
import { updateCacheHitRate } from "../services/statsService";
import { statsIncrement } from "./redis";

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
      // Move cache hit stats to background processing
      setImmediate(async () => {
        try {
          // Update cache hit rate statistics
          await updateCacheHitRate(true);
        } catch (error) {
          console.error("Error updating cache hit stats:", error);
        }
      });

      // Parse JSON synchronously for fastest response
      return JSON.parse(cachedData);
    }

    // Move cache miss stats to background processing
    setImmediate(async () => {
      try {
        // Update cache hit rate statistics (miss)
        await updateCacheHitRate(false);
      } catch (error) {
        console.error("Error updating cache miss stats:", error);
      }
    });

    return null;
  } catch (error) {
    console.error("Error getting cached response:", error);
    return null;
  }
};

/**
 * Store a response in cache with adaptive TTL based on content type and moderation result
 * @param cacheKey Cache key
 * @param response Response to cache
 * @param ttl Time to live in seconds (optional, will use adaptive TTL if not provided)
 */
export const setCachedResponse = async (
  cacheKey: string,
  response: any,
  ttl?: number
): Promise<void> => {
  try {
    // If no TTL provided, determine adaptive TTL based on response content
    if (!ttl) {
      ttl = calculateAdaptiveTTL(response);
    }

    // Use a longer TTL for AI-based results to maximize cache usage
    // This improves performance significantly for similar requests
    await cacheSet(cacheKey, JSON.stringify(response), ttl);

    // Move TTL stats tracking to background processing
    setImmediate(async () => {
      try {
        // Track the TTL used for monitoring
        await statsIncrement("cache:ttl:sum", ttl);
        await statsIncrement("cache:ttl:count");
      } catch (error) {
        console.error("Error tracking cache TTL stats:", error);
      }
    });
  } catch (error) {
    console.error("Error setting cached response:", error);
  }
};

/**
 * Calculate adaptive TTL based on response content and moderation result
 * @param response The moderation response to cache
 * @returns Appropriate TTL in seconds
 */
const calculateAdaptiveTTL = (response: any): number => {
  // Get config values with defaults
  const minTTL = config.caching.minResponseTTL || 3600; // 1 hour minimum
  const maxTTL = config.caching.maxResponseTTL || 604800; // 1 week maximum
  const defaultTTL = config.caching.responseTTL || 86400; // 1 day default

  // Blocked content gets shorter TTL as moderation rules may change
  if (response.blocked) {
    return minTTL; // 1 hour for blocked content
  }

  // If no flags, content is clean and can be cached longer
  if (!response.flags || response.flags.length === 0) {
    return maxTTL; // 1 week for clean content
  }

  // Content with flags but not blocked gets medium TTL
  return defaultTTL; // 1 day for flagged but not blocked
};

/**
 * Generate a cache key for AI service responses
 * @param text Input text for AI
 * @param context Context information (previous messages)
 * @param options Any AI processing options
 * @returns Cache key for AI response
 */
export const generateAICacheKey = (
  text: string,
  context: Array<any> = [],
  options: Record<string, any> = {}
): string => {
  // Only include essential context (last 2 messages max for AI caching)
  const limitedContext = Array.isArray(context)
    ? context
        .slice(-2)
        .map((msg) => (typeof msg === "string" ? msg : msg.text || ""))
    : [];

  // Only include options that affect the AI result
  const essentialOptions = {
    generateFilteredContent: options.generateFilteredContent,
  };

  // Create compact hash input
  const hashInput = JSON.stringify({
    t: text,
    c: limitedContext.length > 0 ? limitedContext : undefined,
    o: essentialOptions,
  });

  // Create hash prefixed with 'ai:' for clarity in cache
  return "ai:" + crypto.createHash("md5").update(hashInput).digest("hex");
};

/**
 * Generate a cache key for image analysis responses
 * @param imageHash Image hash (from generateImageHash)
 * @param options Any image processing options
 * @returns Cache key for image analysis response
 */
export const generateImageCacheKey = (
  imageHash: string,
  options: Record<string, any> = {}
): string => {
  // Create compact hash input with options that affect the result
  const hashInput = JSON.stringify({
    i: imageHash,
    o: options,
  });

  // Create hash prefixed with 'img:' for clarity in cache
  return "img:" + crypto.createHash("md5").update(hashInput).digest("hex");
};
