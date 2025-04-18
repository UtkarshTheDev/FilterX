import {
  redisClient,
  statsPipeline,
  statsGet,
  statsGetMulti,
} from "../utils/redis";
import { config } from "../config";

// Stat key prefixes
const KEY_PREFIXES = {
  TOTAL_REQUESTS: "stats:requests:total",
  FILTERED_REQUESTS: "stats:requests:filtered",
  BLOCKED_REQUESTS: "stats:requests:blocked",
  CACHED_REQUESTS: "stats:requests:cached",
  USER_REQUESTS: "stats:requests:user:",
  FLAG_COUNTS: "stats:flags:",
  LATENCY: "stats:latency:",
  DAILY: "stats:daily:",
  CACHE_HIT_RATE: "stats:cache:hitrate",
};

/**
 * Track a filter request
 */
export const trackFilterRequest = async (
  userId: string,
  isBlocked: boolean,
  flags: string[],
  latencyMs: number,
  isCached: boolean
) => {
  const pipeline = statsPipeline();
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  // Increment total requests
  pipeline.incr(KEY_PREFIXES.TOTAL_REQUESTS);

  // Increment user requests
  pipeline.incr(`${KEY_PREFIXES.USER_REQUESTS}${userId}`);

  // Increment daily stats
  pipeline.incr(`${KEY_PREFIXES.DAILY}${today}`);

  // Increment blocked or filtered counts
  if (isBlocked) {
    pipeline.incr(KEY_PREFIXES.BLOCKED_REQUESTS);
  } else {
    pipeline.incr(KEY_PREFIXES.FILTERED_REQUESTS);
  }

  // Increment cached counts
  if (isCached) {
    pipeline.incr(KEY_PREFIXES.CACHED_REQUESTS);
  }

  // Increment flags counts
  flags.forEach((flag) => {
    pipeline.incr(`${KEY_PREFIXES.FLAG_COUNTS}${flag}`);
  });

  // Track latency (using Redis list for calculating percentiles later)
  pipeline.lpush(`${KEY_PREFIXES.LATENCY}all`, latencyMs.toString());
  pipeline.ltrim(`${KEY_PREFIXES.LATENCY}all`, 0, 9999); // Keep last 10000 entries

  // Execute all commands as a transaction
  try {
    await pipeline.exec();
  } catch (error) {
    console.error("Error tracking stats:", error);
  }
};

/**
 * Update cache hit rate
 */
export const updateCacheHitRate = async (hit: boolean) => {
  try {
    if (hit) {
      await redisClient.incr(`${KEY_PREFIXES.CACHE_HIT_RATE}:hits`);
    }
    await redisClient.incr(`${KEY_PREFIXES.CACHE_HIT_RATE}:total`);
  } catch (error) {
    console.error("Error updating cache hit rate:", error);
  }
};

/**
 * Get summary stats
 */
export const getSummaryStats = async () => {
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  const keys = [
    KEY_PREFIXES.TOTAL_REQUESTS,
    KEY_PREFIXES.FILTERED_REQUESTS,
    KEY_PREFIXES.BLOCKED_REQUESTS,
    KEY_PREFIXES.CACHED_REQUESTS,
    `${KEY_PREFIXES.DAILY}${today}`,
    `${KEY_PREFIXES.CACHE_HIT_RATE}:hits`,
    `${KEY_PREFIXES.CACHE_HIT_RATE}:total`,
  ];

  try {
    const values = await statsGetMulti(keys);

    // Calculate cache hit rate
    const cacheHits = parseInt(values[5] || "0", 10);
    const cacheTotal = parseInt(values[6] || "1", 10); // Prevent division by zero
    const cacheHitRate =
      cacheTotal > 0 ? Math.round((cacheHits / cacheTotal) * 100) : 0;

    // Get latency stats
    const latencyStats = await getLatencyStats();

    // Get flag stats
    const flagStats = await getFlagStats();

    return {
      totalRequests: parseInt(values[0] || "0", 10),
      filteredRequests: parseInt(values[1] || "0", 10),
      blockedRequests: parseInt(values[2] || "0", 10),
      cachedRequests: parseInt(values[3] || "0", 10),
      todayRequests: parseInt(values[4] || "0", 10),
      cacheHitRate: cacheHitRate,
      latency: latencyStats,
      flags: flagStats,
    };
  } catch (error) {
    console.error("Error getting summary stats:", error);
    return null;
  }
};

/**
 * Get latency stats
 */
const getLatencyStats = async () => {
  try {
    // Get all latency values
    const latencyValues = await redisClient.lrange(
      `${KEY_PREFIXES.LATENCY}all`,
      0,
      -1
    );

    if (latencyValues.length === 0) {
      return {
        average: 0,
        p50: 0,
        p95: 0,
        p99: 0,
      };
    }

    // Convert to numbers and sort
    const values = latencyValues
      .map((v) => parseInt(v, 10))
      .sort((a, b) => a - b);

    // Calculate stats
    const average = values.reduce((a, b) => a + b, 0) / values.length;
    const p50 = values[Math.floor(values.length * 0.5)];
    const p95 = values[Math.floor(values.length * 0.95)];
    const p99 = values[Math.floor(values.length * 0.99)];

    return {
      average: Math.round(average),
      p50,
      p95,
      p99,
    };
  } catch (error) {
    console.error("Error getting latency stats:", error);
    return {
      average: 0,
      p50: 0,
      p95: 0,
      p99: 0,
    };
  }
};

/**
 * Get flag stats
 */
const getFlagStats = async () => {
  try {
    // Get all flag keys
    const flagKeys = await redisClient.keys(`${KEY_PREFIXES.FLAG_COUNTS}*`);

    if (flagKeys.length === 0) {
      return {};
    }

    // Get flag counts
    const pipeline = statsPipeline();
    flagKeys.forEach((key) => pipeline.get(key));

    const results = await pipeline.exec();
    if (!results) {
      return {};
    }

    // Format results
    const flagStats: Record<string, number> = {};

    flagKeys.forEach((key, index) => {
      const flagName = key.replace(KEY_PREFIXES.FLAG_COUNTS, "");
      const count = parseInt((results[index][1] as string) || "0", 10);
      flagStats[flagName] = count;
    });

    return flagStats;
  } catch (error) {
    console.error("Error getting flag stats:", error);
    return {};
  }
};
