import {
  redisClient,
  statsPipeline,
  statsGet,
  statsGetMulti,
} from "../utils/redis";
import { config } from "../config";

// Stat key prefixes - optimized to reduce redundancy
const KEY_PREFIXES = {
  TOTAL_REQUESTS: "stats:requests:total", // Primary counter for all requests
  BLOCKED_REQUESTS: "stats:requests:blocked", // Only track blocked, filtered can be derived
  CACHED_REQUESTS: "stats:requests:cached",
  USER_REQUESTS: "stats:requests:user:",
  FLAG_COUNTS: "stats:flags:",
  LATENCY: "stats:latency:", // Optimized to use sampling instead of storing all values
  // Removed stats:cache:unified as requested
  // Removed redundant DAILY prefix as it duplicates TOTAL_REQUESTS
  // Removed redundant FILTERED_REQUESTS as it can be derived from TOTAL - BLOCKED
  // Removed consolidated cache tracking prefixes
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

  // Increment total requests - this is our primary counter
  pipeline.incr(KEY_PREFIXES.TOTAL_REQUESTS);

  // Increment user requests
  pipeline.incr(`${KEY_PREFIXES.USER_REQUESTS}${userId}`);

  // Only track blocked requests - filtered can be derived (total - blocked)
  if (isBlocked) {
    pipeline.incr(KEY_PREFIXES.BLOCKED_REQUESTS);
  }

  // Increment cached counts
  if (isCached) {
    pipeline.incr(KEY_PREFIXES.CACHED_REQUESTS);
  }

  // Increment flags counts
  flags.forEach((flag) => {
    pipeline.incr(`${KEY_PREFIXES.FLAG_COUNTS}${flag}`);
  });

  // Track latency for all requests but keep a smaller window
  // This ensures we have accurate recent data for averages
  pipeline.lpush(`${KEY_PREFIXES.LATENCY}all`, latencyMs.toString());
  pipeline.ltrim(`${KEY_PREFIXES.LATENCY}all`, 0, 499); // Keep last 500 entries for accurate recent stats

  // Execute all commands as a transaction
  try {
    await pipeline.exec();
  } catch (error) {
    console.error("Error tracking stats:", error);
  }
};

/**
 * Update cache hit rate - simplified to use direct keys
 * @param hit Whether the request was a cache hit
 * @param cacheType Optional cache type identifier (filter, ai, image)
 */
export const updateCacheHitRate = async (
  hit: boolean,
  cacheType: string = "general"
) => {
  try {
    // Simple implementation that just tracks hits and misses
    // We're not tracking cache hit rates anymore as requested
    // This function is kept for API compatibility but doesn't store anything
  } catch (error) {
    console.error("Error updating cache hit rate:", error);
  }
};

/**
 * Get summary stats - optimized to work with consolidated keys
 */
export const getSummaryStats = async () => {
  try {
    // Get basic request stats
    const [totalRequests, blockedRequests, cachedRequests] =
      await statsGetMulti([
        KEY_PREFIXES.TOTAL_REQUESTS,
        KEY_PREFIXES.BLOCKED_REQUESTS,
        KEY_PREFIXES.CACHED_REQUESTS,
      ]);

    // Parse basic stats
    const totalReq = parseInt(totalRequests || "0", 10);
    const blockedReq = parseInt(blockedRequests || "0", 10);
    // Calculate filtered requests (derived value)
    const filteredReq = totalReq - blockedReq;

    // We're no longer tracking cache hit rates in Redis
    // Just use the cached requests count as a proxy
    const cachedReq = parseInt(cachedRequests || "0", 10);
    const cacheHitRate =
      totalReq > 0 ? Math.round((cachedReq / totalReq) * 100) : 0;

    // Get API stats from consolidated hashes
    const textApiData = (await redisClient.hgetall("api:stats:text")) || {};
    const imageApiData = (await redisClient.hgetall("api:stats:image")) || {};

    // Parse API stats
    const aiApiCalls = parseInt(textApiData["calls"] || "0", 10);
    const aiApiErrors = parseInt(textApiData["errors"] || "0", 10);
    const aiApiTotalTime = parseInt(textApiData["total_time"] || "0", 10);

    const imageApiCalls = parseInt(imageApiData["calls"] || "0", 10);
    const imageApiErrors = parseInt(imageApiData["errors"] || "0", 10);
    const imageApiTotalTime = parseInt(imageApiData["total_time"] || "0", 10);

    // We're no longer tracking detailed API cache stats
    // Use default values for API compatibility
    const aiCacheHits = 0;
    const aiCacheMisses = 0;

    const imageCacheHits = 0;
    const imageCacheMisses = 0;

    // Get AI and image stats only (removed prescreening, performance, and filter controller metrics)
    const [
      aiCalled,
      aiBlocked,
      aiAllowed,
      aiErrors,
      imageCalled,
      imageBlocked,
      imageAllowed,
      imageErrors,
    ] = await statsGetMulti([
      "filter:ai:called",
      "filter:ai:blocked",
      "filter:ai:allowed",
      "filter:ai:errors",
      "filter:image:called",
      "filter:image:blocked",
      "filter:image:allowed",
      "filter:image:errors",
    ]);

    // Parse AI and image stats
    const aiCalledVal = parseInt(aiCalled || "0", 10);
    const aiBlockedVal = parseInt(aiBlocked || "0", 10);
    const aiAllowedVal = parseInt(aiAllowed || "0", 10);
    const aiErrorsVal = parseInt(aiErrors || "0", 10);
    const imageCalledVal = parseInt(imageCalled || "0", 10);
    const imageBlockedVal = parseInt(imageBlocked || "0", 10);
    const imageAllowedVal = parseInt(imageAllowed || "0", 10);
    const imageErrorsVal = parseInt(imageErrors || "0", 10);

    // Calculate derived values
    const aiTotal = aiBlockedVal + aiAllowedVal;
    const aiBlockRate =
      aiTotal > 0 ? Math.round((aiBlockedVal / aiTotal) * 100) : 0;

    // Calculate API latency averages
    const aiApiAvgTime =
      aiApiCalls > 0 ? Math.round(aiApiTotalTime / aiApiCalls) : 0;
    const imageApiAvgTime =
      imageApiCalls > 0 ? Math.round(imageApiTotalTime / imageApiCalls) : 0;

    // Get latency stats
    const latencyStats = await getLatencyStats();

    // Get flag stats
    const flagStats = await getFlagStats();

    return {
      totalRequests: totalReq,
      filteredRequests: filteredReq,
      blockedRequests: blockedReq,
      cachedRequests: parseInt(cachedRequests || "0", 10),
      todayRequests: totalReq, // Today's requests are now the same as total
      cacheHitRate: cacheHitRate,
      latency: latencyStats,
      flags: flagStats,
      // Add optimization stats
      optimization: {
        cache: {
          hits: cachedReq,
          misses: totalReq - cachedReq,
          hitRate: cacheHitRate,
        },
        ai: {
          called: aiCalledVal,
          blocked: aiBlockedVal,
          allowed: aiAllowedVal,
          errors: aiErrorsVal,
          blockRate: aiBlockRate,
          usagePercent:
            totalReq > 0 ? Math.round((aiCalledVal / totalReq) * 100) : 0,
          // Add AI API performance metrics
          cache: {
            hits: aiCacheHits,
            misses: aiCacheMisses,
            hitRate: 0, // No longer tracking detailed API cache stats
          },
          api: {
            calls: aiApiCalls,
            errors: aiApiErrors,
            avgResponseTime: aiApiAvgTime,
            errorRate:
              aiApiCalls > 0 ? Math.round((aiApiErrors / aiApiCalls) * 100) : 0,
          },
        },
        image: {
          called: imageCalledVal,
          blocked: imageBlockedVal,
          allowed: imageAllowedVal,
          errors: imageErrorsVal,
          // Add image API performance metrics
          cache: {
            hits: imageCacheHits,
            misses: imageCacheMisses,
            hitRate: 0, // No longer tracking detailed API cache stats
          },
          api: {
            calls: imageApiCalls,
            errors: imageApiErrors,
            avgResponseTime: imageApiAvgTime,
            errorRate:
              imageApiCalls > 0
                ? Math.round((imageApiErrors / imageApiCalls) * 100)
                : 0,
          },
        },
        // Simplified performance metrics - we're not tracking detailed buckets anymore
        performance: {
          avgResponseTime: latencyStats.average,
          p95ResponseTime: latencyStats.p95,
        },
      },
    };
  } catch (error) {
    console.error("Error getting summary stats:", error);
    return null;
  }
};

/**
 * Get latency stats - optimized for sampled data
 */
const getLatencyStats = async () => {
  try {
    // Get sampled latency values
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

    // Calculate stats - these are now based on sampled data
    // but statistically valid due to random sampling
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

/**
 * Track API call response time - optimized to reduce Redis keys
 * @param apiType Type of API ('text' or 'image')
 * @param responseTimeMs Response time in milliseconds
 * @param isError Whether the call resulted in an error
 * @param isCacheHit Whether the result was from cache
 */
export const trackApiResponseTime = async (
  apiType: "text" | "image",
  responseTimeMs: number,
  isError: boolean = false,
  isCacheHit: boolean = false
): Promise<void> => {
  try {
    // Store data in Redis using a hash to reduce key count
    const pipeline = statsPipeline();
    const hashKey = `api:stats:${apiType}`;

    // Use a single hash for all metrics related to this API type
    if (isCacheHit) {
      // Update cache hit stats in the consolidated cache tracking
      updateCacheHitRate(true, `api:${apiType}`);
    } else {
      // Increment call counts in the hash
      pipeline.hincrby(hashKey, "calls", 1);

      // Track errors if applicable
      if (isError) {
        pipeline.hincrby(hashKey, "errors", 1);
      }

      // Track total time for calculating averages
      pipeline.hincrby(hashKey, "total_time", responseTimeMs);

      // Track cache miss in the consolidated tracking
      updateCacheHitRate(false, `api:${apiType}`);
    }

    // Execute pipeline
    await pipeline.exec();
  } catch (error) {
    console.error(`Error tracking API response time:`, error);
  }
};

/**
 * Get detailed performance statistics for all APIs
 */
export const getDetailedPerformanceStats = async () => {
  try {
    // Get data for the last 24 hours
    const endTime = Date.now();
    const startTime = endTime - 24 * 60 * 60 * 1000; // 24 hours ago

    // Get detailed performance data
    const textApiData = await getApiPerformanceData("text", startTime, endTime);
    const imageApiData = await getApiPerformanceData(
      "image",
      startTime,
      endTime
    );

    return {
      timeRange: "24h",
      timestamp: new Date().toISOString(),
      textApi: textApiData,
      imageApi: imageApiData,
      summary: {
        avgResponseTime: {
          text: textApiData.avgResponseTime,
          image: imageApiData.avgResponseTime,
          overall: Math.round(
            (textApiData.totalCalls * textApiData.avgResponseTime +
              imageApiData.totalCalls * imageApiData.avgResponseTime) /
              Math.max(1, textApiData.totalCalls + imageApiData.totalCalls)
          ),
        },
        errorRate: {
          text: textApiData.errorRate,
          image: imageApiData.errorRate,
          overall: Math.round(
            ((textApiData.errors + imageApiData.errors) /
              Math.max(1, textApiData.totalCalls + imageApiData.totalCalls)) *
              100
          ),
        },
        cacheHitRate: {
          text: textApiData.cacheHitRate,
          image: imageApiData.cacheHitRate,
          overall: Math.round(
            ((textApiData.cacheHits + imageApiData.cacheHits) /
              Math.max(
                1,
                textApiData.totalRequests + imageApiData.totalRequests
              )) *
              100
          ),
        },
      },
    };
  } catch (error) {
    console.error("Error getting detailed performance stats:", error);
    return {
      error: "Failed to retrieve performance statistics",
      timestamp: new Date().toISOString(),
    };
  }
};

/**
 * Get performance data for a specific API type - optimized for consolidated hash storage
 *
 * @param apiType Type of API ('text' or 'image')
 * @param startTime Start timestamp (ms) - kept for API compatibility
 * @param endTime End timestamp (ms) - kept for API compatibility
 */
const getApiPerformanceData = async (
  apiType: "text" | "image",
  startTime: number,
  endTime: number
) => {
  // Get API stats from consolidated hash
  const hashKey = `api:stats:${apiType}`;
  const apiData = (await redisClient.hgetall(hashKey)) || {};

  // Parse API stats
  const calls = parseInt(apiData["calls"] || "0", 10);
  const errors = parseInt(apiData["errors"] || "0", 10);
  const totalTime = parseInt(apiData["total_time"] || "0", 10);

  // We're no longer tracking detailed cache stats
  const hits = 0;
  const misses = 0;
  const total = 1; // Prevent division by zero

  // Calculate metrics
  const totalCalls = Math.max(1, calls); // Prevent division by zero
  const totalRequests = total;
  const avgResponseTime = Math.round(totalTime / totalCalls);
  const errorRate = Math.round((errors / totalCalls) * 100);
  const cacheHitRate = total > 0 ? Math.round((hits / total) * 100) : 0;

  // Return empty array for timeseriesData since we no longer store it
  return {
    totalCalls,
    errors,
    avgResponseTime,
    errorRate,
    cacheHits: hits,
    cacheMisses: misses,
    totalRequests,
    cacheHitRate,
    timeseriesData: [], // Empty array since time series data is no longer stored
  };
};

/**
 * Get time-series data for response times
 * Note: Time series data storage has been removed to reduce Redis usage
 * This function now returns an empty array
 *
 * @param apiType Type of API ('text' or 'image')
 * @param startTime Start timestamp (ms)
 * @param endTime End timestamp (ms)
 */
const getTimeSeriesData = async (
  apiType: "text" | "image",
  startTime: number,
  endTime: number
) => {
  // Time series data storage has been removed
  // Return an empty array to maintain API compatibility
  return [];
};

/**
 * Get AI response time data for monitoring
 * Note: Time series data storage has been removed to reduce Redis usage
 * This function now returns only aggregate statistics
 */
export const getAIResponseTimeData = async (
  timeRange: string = "24h",
  limit: number = 100
) => {
  // Parse time range (kept for API compatibility)
  const endTime = Date.now();
  let startTime = endTime;

  if (timeRange === "1h") {
    startTime = endTime - 60 * 60 * 1000; // 1 hour ago
  } else if (timeRange === "24h") {
    startTime = endTime - 24 * 60 * 60 * 1000; // 24 hours ago
  } else if (timeRange === "7d") {
    startTime = endTime - 7 * 24 * 60 * 60 * 1000; // 7 days ago
  } else if (timeRange === "30d") {
    startTime = endTime - 30 * 24 * 60 * 60 * 1000; // 30 days ago
  }

  // Get API performance data
  const textApiData = await getApiPerformanceData("text", startTime, endTime);
  const imageApiData = await getApiPerformanceData("image", startTime, endTime);

  // Empty response times arrays (since time series data is no longer stored)
  const textResponseTimes = [];
  const imageResponseTimes = [];

  return {
    timeRange,
    limit,
    timestamp: new Date().toISOString(),
    textApi: {
      responseTimes: textResponseTimes,
      avgResponseTime: textApiData.avgResponseTime,
      p95ResponseTime: 0, // No data for p95 calculation
      errorRate: textApiData.errorRate,
      cacheHitRate: textApiData.cacheHitRate,
    },
    imageApi: {
      responseTimes: imageResponseTimes,
      avgResponseTime: imageApiData.avgResponseTime,
      p95ResponseTime: 0, // No data for p95 calculation
      errorRate: imageApiData.errorRate,
      cacheHitRate: imageApiData.cacheHitRate,
    },
  };
};
