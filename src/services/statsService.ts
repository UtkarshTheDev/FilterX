import {
  statsPipeline,
  statsGet,
  statsGetMulti,
  statsHGetAll,
  statsLRange,
  statsIncrement,
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
  try {
    console.log(
      `[Stats] Tracking filter request for user: ${userId}, blocked: ${isBlocked}, cached: ${isCached}, flags: [${flags.join(
        ", "
      )}]`
    );

    const pipeline = statsPipeline();

    // Increment total requests - this is our primary counter
    pipeline.incr(KEY_PREFIXES.TOTAL_REQUESTS);
    console.log(`[Stats] Queued increment for ${KEY_PREFIXES.TOTAL_REQUESTS}`);

    // Increment user requests
    const userKey = `${KEY_PREFIXES.USER_REQUESTS}${userId}`;
    pipeline.incr(userKey);
    console.log(`[Stats] Queued increment for ${userKey}`);

    // Only track blocked requests - filtered can be derived (total - blocked)
    if (isBlocked) {
      pipeline.incr(KEY_PREFIXES.BLOCKED_REQUESTS);
      console.log(
        `[Stats] Queued increment for ${KEY_PREFIXES.BLOCKED_REQUESTS}`
      );
    }

    // Increment cached counts
    if (isCached) {
      pipeline.incr(KEY_PREFIXES.CACHED_REQUESTS);
      console.log(
        `[Stats] Queued increment for ${KEY_PREFIXES.CACHED_REQUESTS}`
      );
    }

    // Increment flags counts
    flags.forEach((flag) => {
      const flagKey = `${KEY_PREFIXES.FLAG_COUNTS}${flag}`;
      pipeline.incr(flagKey);
      console.log(`[Stats] Queued increment for flag: ${flagKey}`);
    });

    // Track latency for all requests but keep a smaller window
    // This ensures we have accurate recent data for averages
    const latencyKey = `${KEY_PREFIXES.LATENCY}all`;
    pipeline.lpush(latencyKey, latencyMs.toString());
    pipeline.ltrim(latencyKey, 0, 499); // Keep last 500 entries for accurate recent stats
    console.log(
      `[Stats] Queued latency tracking for ${latencyKey}: ${latencyMs}ms`
    );

    // Execute all commands as a transaction
    console.log(
      `[Stats] Executing pipeline with ${flags.length + 4} operations`
    );
    const results = await pipeline.exec();

    if (results) {
      console.log(
        `[Stats] Pipeline executed successfully with ${results.length} results`
      );

      // Log any errors in the pipeline results
      results.forEach((result, index) => {
        if (result && result[0]) {
          console.error(
            `[Stats] Pipeline operation ${index} failed:`,
            result[0]
          );
        }
      });
    } else {
      console.warn(
        `[Stats] Pipeline execution returned null/undefined results`
      );
    }

    // Verify that the main counter was actually incremented
    const totalAfter = await statsGet(KEY_PREFIXES.TOTAL_REQUESTS);
    console.log(`[Stats] Total requests after increment: ${totalAfter}`);
  } catch (error) {
    console.error("[Stats] Error tracking filter request stats:", error);

    // Fallback: try to increment the main counter directly if pipeline failed
    try {
      console.log("[Stats] Attempting fallback direct increment");
      await statsIncrement(KEY_PREFIXES.TOTAL_REQUESTS);
      await statsIncrement(`${KEY_PREFIXES.USER_REQUESTS}${userId}`);

      if (isBlocked) {
        await statsIncrement(KEY_PREFIXES.BLOCKED_REQUESTS);
      }

      if (isCached) {
        await statsIncrement(KEY_PREFIXES.CACHED_REQUESTS);
      }

      // Track flags individually
      for (const flag of flags) {
        await statsIncrement(`${KEY_PREFIXES.FLAG_COUNTS}${flag}`);
      }

      console.log("[Stats] Fallback direct increment completed");
    } catch (fallbackError) {
      console.error("[Stats] Fallback increment also failed:", fallbackError);
    }
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
    // Get basic request stats with error handling
    let totalRequests: string | null = "0",
      blockedRequests: string | null = "0",
      cachedRequests: string | null = "0";

    try {
      const results = await statsGetMulti([
        KEY_PREFIXES.TOTAL_REQUESTS,
        KEY_PREFIXES.BLOCKED_REQUESTS,
        KEY_PREFIXES.CACHED_REQUESTS,
      ]);
      totalRequests = results[0];
      blockedRequests = results[1];
      cachedRequests = results[2];
    } catch (error) {
      console.error("Error fetching basic request stats:", error);
      // Continue with default values
    }

    // Parse basic stats with safe defaults
    const totalReq = parseInt(totalRequests || "0", 10);
    const blockedReq = parseInt(blockedRequests || "0", 10);
    // Calculate filtered requests (derived value)
    const filteredReq = totalReq - blockedReq;

    // We're no longer tracking cache hit rates in Redis
    // Just use the cached requests count as a proxy
    const cachedReq = parseInt(cachedRequests || "0", 10);
    const cacheHitRate =
      totalReq > 0 ? Math.round((cachedReq / totalReq) * 100) : 0;

    // Get API stats from consolidated hashes with error handling
    let textApiData: Record<string, string> = {};
    let imageApiData: Record<string, string> = {};

    try {
      if (redisClient && redisClient.status === "ready") {
        textApiData = (await redisClient.hgetall("api:stats:text")) || {};
        imageApiData = (await redisClient.hgetall("api:stats:image")) || {};
      }
    } catch (error) {
      console.error("Error fetching API stats from Redis:", error);
      // Continue with empty objects
    }

    // Parse API stats
    const aiApiCalls = parseInt(textApiData["calls"] || "0", 10);
    const aiApiErrors = parseInt(textApiData["errors"] || "0", 10);
    const aiApiTotalTime = parseInt(textApiData["total_time"] || "0", 10);

    const imageApiCalls = parseInt(imageApiData["calls"] || "0", 10);
    const imageApiErrors = parseInt(imageApiData["errors"] || "0", 10);
    const imageApiTotalTime = parseInt(imageApiData["total_time"] || "0", 10);

    // Cache stats are no longer tracked (removed from database schema)

    // Get AI and image stats only (removed prescreening, performance, and filter controller metrics)
    let aiCalled: string | null = "0",
      aiBlocked: string | null = "0",
      aiAllowed: string | null = "0",
      aiErrors: string | null = "0";
    let imageCalled: string | null = "0",
      imageBlocked: string | null = "0",
      imageAllowed: string | null = "0",
      imageErrors: string | null = "0";

    try {
      const results = await statsGetMulti([
        "filter:ai:called",
        "filter:ai:blocked",
        "filter:ai:allowed",
        "filter:ai:errors",
        "filter:image:called",
        "filter:image:blocked",
        "filter:image:allowed",
        "filter:image:errors",
      ]);
      aiCalled = results[0];
      aiBlocked = results[1];
      aiAllowed = results[2];
      aiErrors = results[3];
      imageCalled = results[4];
      imageBlocked = results[5];
      imageAllowed = results[6];
      imageErrors = results[7];
    } catch (error) {
      console.error("Error fetching AI and image filter stats:", error);
      // Continue with default values
    }

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
          // AI API performance metrics (cache tracking removed)
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
          // Image API performance metrics (cache tracking removed)
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
    // Check if Redis is available
    if (!redisClient || redisClient.status !== "ready") {
      console.warn("Redis not available for latency stats");
      return {
        average: 0,
        p50: 0,
        p95: 0,
        p99: 0,
      };
    }

    // Get sampled latency values with error handling
    let latencyValues = [];
    try {
      latencyValues = await redisClient.lrange(
        `${KEY_PREFIXES.LATENCY}all`,
        0,
        -1
      );
    } catch (error) {
      console.error("Error fetching latency values from Redis:", error);
      return {
        average: 0,
        p50: 0,
        p95: 0,
        p99: 0,
      };
    }

    if (latencyValues.length === 0) {
      return {
        average: 0,
        p50: 0,
        p95: 0,
        p99: 0,
      };
    }

    // Convert to numbers and sort with error handling
    const values = latencyValues
      .map((v) => parseInt(v, 10))
      .filter((v) => !isNaN(v)) // Filter out invalid values
      .sort((a, b) => a - b);

    if (values.length === 0) {
      return {
        average: 0,
        p50: 0,
        p95: 0,
        p99: 0,
      };
    }

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
    // Check if Redis is available
    if (!redisClient || redisClient.status !== "ready") {
      console.warn("Redis not available for flag stats");
      return {};
    }

    // Get all flag keys with error handling
    let flagKeys = [];
    try {
      flagKeys = await redisClient.keys(`${KEY_PREFIXES.FLAG_COUNTS}*`);
    } catch (error) {
      console.error("Error fetching flag keys from Redis:", error);
      return {};
    }

    if (flagKeys.length === 0) {
      return {};
    }

    // Get flag counts with error handling
    let results = null;
    try {
      const pipeline = statsPipeline();
      flagKeys.forEach((key) => pipeline.get(key));
      results = await pipeline.exec();
    } catch (error) {
      console.error("Error executing pipeline for flag stats:", error);
      return {};
    }

    if (!results) {
      return {};
    }

    // Format results with error handling
    const flagStats: Record<string, number> = {};

    flagKeys.forEach((key, index) => {
      try {
        const flagName = key.replace(KEY_PREFIXES.FLAG_COUNTS, "");
        const count = parseInt((results[index][1] as string) || "0", 10);
        if (!isNaN(count)) {
          flagStats[flagName] = count;
        }
      } catch (error) {
        console.error(`Error processing flag stat for key ${key}:`, error);
      }
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
    console.log(
      `[Stats] Tracking API response time for ${apiType}: ${responseTimeMs}ms, error: ${isError}, cached: ${isCacheHit}`
    );

    // Store data in Redis using a hash to reduce key count
    const pipeline = statsPipeline();
    const hashKey = `api:stats:${apiType}`;

    // Track all API calls regardless of cache status
    pipeline.hincrby(hashKey, "calls", 1);
    console.log(`[Stats] Queued hincrby for ${hashKey}:calls`);

    // Track errors if applicable
    if (isError) {
      pipeline.hincrby(hashKey, "errors", 1);
      console.log(`[Stats] Queued hincrby for ${hashKey}:errors`);
    }

    // Track total time for calculating averages
    pipeline.hincrby(hashKey, "total_time", responseTimeMs);
    console.log(
      `[Stats] Queued hincrby for ${hashKey}:total_time by ${responseTimeMs}`
    );

    // Cache hit rate tracking is no longer used (removed for optimization)

    // Execute pipeline
    console.log(`[Stats] Executing API stats pipeline for ${apiType}`);
    const results = await pipeline.exec();

    if (results) {
      console.log(
        `[Stats] API stats pipeline executed successfully with ${results.length} results`
      );

      // Log any errors in the pipeline results
      results.forEach((result, index) => {
        if (result && result[0]) {
          console.error(
            `[Stats] API stats pipeline operation ${index} failed:`,
            result[0]
          );
        }
      });
    } else {
      console.warn(
        `[Stats] API stats pipeline execution returned null/undefined results`
      );
    }
  } catch (error) {
    console.error(
      `[Stats] Error tracking API response time for ${apiType}:`,
      error
    );

    // Fallback: try to track directly if pipeline failed
    try {
      console.log(
        `[Stats] Attempting fallback direct tracking for ${apiType} API`
      );
      const hashKey = `api:stats:${apiType}`;

      await statsIncrement(`${hashKey}:calls`);
      if (isError) {
        await statsIncrement(`${hashKey}:errors`);
      }
      await statsIncrement(`${hashKey}:total_time`, responseTimeMs);

      console.log(`[Stats] Fallback API tracking completed for ${apiType}`);
    } catch (fallbackError) {
      console.error(
        `[Stats] Fallback API tracking also failed for ${apiType}:`,
        fallbackError
      );
    }
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
        // Cache hit rate removed - no longer tracked
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
  // Get API stats from consolidated hash with error handling
  const hashKey = `api:stats:${apiType}`;
  let apiData: Record<string, string> = {};

  try {
    apiData = (await statsHGetAll(hashKey)) || {};
  } catch (error) {
    console.error(`Error fetching API performance data for ${apiType}:`, error);
    // Continue with empty object
  }

  // Parse API stats with safe defaults
  const calls = parseInt(apiData["calls"] || "0", 10);
  const errors = parseInt(apiData["errors"] || "0", 10);
  const totalTime = parseInt(apiData["total_time"] || "0", 10);

  // Calculate metrics with safe division
  const avgResponseTime = calls > 0 ? Math.round(totalTime / calls) : 0;
  const errorRate = calls > 0 ? Math.round((errors / calls) * 100) : 0;

  // Return simplified data (cache fields removed)
  return {
    totalCalls: calls,
    errors,
    avgResponseTime,
    errorRate,
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
  const textResponseTimes: number[] = [];
  const imageResponseTimes: number[] = [];

  return {
    timeRange,
    limit,
    timestamp: new Date().toISOString(),
    textApi: {
      responseTimes: textResponseTimes,
      avgResponseTime: textApiData.avgResponseTime,
      p95ResponseTime: 0, // No data for p95 calculation
      errorRate: textApiData.errorRate,
      // Cache hit rate removed - no longer tracked
    },
    imageApi: {
      responseTimes: imageResponseTimes,
      avgResponseTime: imageApiData.avgResponseTime,
      p95ResponseTime: 0, // No data for p95 calculation
      errorRate: imageApiData.errorRate,
      // Cache hit rate removed - no longer tracked
    },
  };
};
