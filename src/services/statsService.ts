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
  PRESCREENING: "stats:prescreening:",
  AI_PROCESSING: "stats:ai:",
  IMAGE_PROCESSING: "stats:image:",
  PERFORMANCE: "stats:performance:",
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
    // New optimization metrics
    "filter:cache:hits",
    "filter:cache:misses",
    "filter:prescreening:handled",
    "filter:prescreening:allowed",
    "filter:ai:called",
    "filter:ai:blocked",
    "filter:ai:allowed",
    "filter:ai:errors",
    "filter:image:called",
    "filter:image:blocked",
    "filter:image:allowed",
    "filter:image:errors",
    // Performance metrics
    "filter:performance:under100ms",
    "filter:performance:under500ms",
    "filter:performance:under1000ms",
    "filter:performance:over1000ms",
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

    // Fetch optimization metrics
    const filterCacheHits = parseInt(values[7] || "0", 10);
    const filterCacheMisses = parseInt(values[8] || "0", 10);
    const filterTotal = filterCacheHits + filterCacheMisses;
    const filterCacheRate =
      filterTotal > 0 ? Math.round((filterCacheHits / filterTotal) * 100) : 0;

    const prescreenHandled = parseInt(values[9] || "0", 10);
    const prescreenAllowed = parseInt(values[10] || "0", 10);

    const aiCalled = parseInt(values[11] || "0", 10);
    const aiBlocked = parseInt(values[12] || "0", 10);
    const aiAllowed = parseInt(values[13] || "0", 10);
    const aiErrors = parseInt(values[14] || "0", 10);
    const aiTotal = aiBlocked + aiAllowed;
    const aiBlockRate =
      aiTotal > 0 ? Math.round((aiBlocked / aiTotal) * 100) : 0;

    const imageCalled = parseInt(values[15] || "0", 10);
    const imageBlocked = parseInt(values[16] || "0", 10);
    const imageAllowed = parseInt(values[17] || "0", 10);
    const imageErrors = parseInt(values[18] || "0", 10);

    // Performance metrics
    const under100ms = parseInt(values[19] || "0", 10);
    const under500ms = parseInt(values[20] || "0", 10);
    const under1000ms = parseInt(values[21] || "0", 10);
    const over1000ms = parseInt(values[22] || "0", 10);
    const totalPerf = under100ms + under500ms + under1000ms + over1000ms;

    // Calculate optimization rates
    const requestsSkippedByPrescreen =
      totalPerf > 0 ? Math.round((prescreenHandled / totalPerf) * 100) : 0;

    const requestsHandledByAI =
      totalPerf > 0 ? Math.round((aiCalled / totalPerf) * 100) : 0;

    return {
      totalRequests: parseInt(values[0] || "0", 10),
      filteredRequests: parseInt(values[1] || "0", 10),
      blockedRequests: parseInt(values[2] || "0", 10),
      cachedRequests: parseInt(values[3] || "0", 10),
      todayRequests: parseInt(values[4] || "0", 10),
      cacheHitRate: cacheHitRate,
      latency: latencyStats,
      flags: flagStats,
      // Add optimization stats
      optimization: {
        cache: {
          hits: filterCacheHits,
          misses: filterCacheMisses,
          hitRate: filterCacheRate,
        },
        prescreening: {
          handled: prescreenHandled,
          allowed: prescreenAllowed,
          handledPercent: requestsSkippedByPrescreen,
        },
        ai: {
          called: aiCalled,
          blocked: aiBlocked,
          allowed: aiAllowed,
          errors: aiErrors,
          blockRate: aiBlockRate,
          usagePercent: requestsHandledByAI,
        },
        image: {
          called: imageCalled,
          blocked: imageBlocked,
          allowed: imageAllowed,
          errors: imageErrors,
        },
        performance: {
          under100ms,
          under500ms,
          under1000ms,
          over1000ms,
          responseTimeBreakdown:
            totalPerf > 0
              ? {
                  under100ms: Math.round((under100ms / totalPerf) * 100),
                  under500ms: Math.round((under500ms / totalPerf) * 100),
                  under1000ms: Math.round((under1000ms / totalPerf) * 100),
                  over1000ms: Math.round((over1000ms / totalPerf) * 100),
                }
              : { under100ms: 0, under500ms: 0, under1000ms: 0, over1000ms: 0 },
        },
      },
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
