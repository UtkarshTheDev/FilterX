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
  CACHE_DETAILED: "stats:cache:detailed:",
  AI_API_USAGE: "stats:api:usage:",
  AI_RESPONSE_TIMES: "stats:ai:timeseries:",
  IMAGE_RESPONSE_TIMES: "stats:image:timeseries:",
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
    // Add API cache performance metrics
    "ai:cache:hits",
    "ai:cache:misses",
    "ai:api:call_count",
    "ai:api:errors",
    "ai:api:total_time",
    "image:cache:hits",
    "image:cache:misses",
    "image:api:call_count",
    "image:api:errors",
    "image:api:total_time",
    // Cache TTL tracking
    "cache:ttl:sum",
    "cache:ttl:count",
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

    // Extract new API cache metrics
    const aiCacheHits = parseInt(values[23] || "0", 10);
    const aiCacheMisses = parseInt(values[24] || "0", 10);
    const aiApiCalls = parseInt(values[25] || "0", 10);
    const aiApiErrors = parseInt(values[26] || "0", 10);
    const aiApiTotalTime = parseInt(values[27] || "0", 10);

    const imageCacheHits = parseInt(values[28] || "0", 10);
    const imageCacheMisses = parseInt(values[29] || "0", 10);
    const imageApiCalls = parseInt(values[30] || "0", 10);
    const imageApiErrors = parseInt(values[31] || "0", 10);
    const imageApiTotalTime = parseInt(values[32] || "0", 10);

    // Calculate cache TTL average
    const cacheTtlSum = parseInt(values[33] || "0", 10);
    const cacheTtlCount = parseInt(values[34] || "1", 10); // Prevent division by zero
    const avgCacheTtl = Math.round(cacheTtlSum / cacheTtlCount);

    // Calculate API latency averages
    const aiApiAvgTime =
      aiApiCalls > 0 ? Math.round(aiApiTotalTime / aiApiCalls) : 0;
    const imageApiAvgTime =
      imageApiCalls > 0 ? Math.round(imageApiTotalTime / imageApiCalls) : 0;

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
          avgTtlSeconds: avgCacheTtl,
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
          // Add AI API performance metrics
          cache: {
            hits: aiCacheHits,
            misses: aiCacheMisses,
            hitRate:
              aiCacheHits + aiCacheMisses > 0
                ? Math.round(
                    (aiCacheHits / (aiCacheHits + aiCacheMisses)) * 100
                  )
                : 0,
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
          called: imageCalled,
          blocked: imageBlocked,
          allowed: imageAllowed,
          errors: imageErrors,
          // Add image API performance metrics
          cache: {
            hits: imageCacheHits,
            misses: imageCacheMisses,
            hitRate:
              imageCacheHits + imageCacheMisses > 0
                ? Math.round(
                    (imageCacheHits / (imageCacheHits + imageCacheMisses)) * 100
                  )
                : 0,
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

/**
 * Track API call response time
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
    const timestamp = Date.now();
    const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const hour = new Date().getHours();

    // Create keys for time-series data (one entry per minute)
    const minute = Math.floor(Date.now() / 60000); // Current minute timestamp
    const timeseriesKey =
      apiType === "text"
        ? `${KEY_PREFIXES.AI_RESPONSE_TIMES}${date}:${hour}:${minute % 60}`
        : `${KEY_PREFIXES.IMAGE_RESPONSE_TIMES}${date}:${hour}:${minute % 60}`;

    // Store data in Redis
    const pipeline = statsPipeline();

    // Add data point to time-series
    pipeline.rpush(
      timeseriesKey,
      JSON.stringify({
        timestamp,
        responseTime: responseTimeMs,
        isError,
        isCacheHit,
      })
    );

    // Set TTL for time-series data (keep for 7 days)
    pipeline.expire(timeseriesKey, 60 * 60 * 24 * 7);

    // Track summary metrics as well
    const metricPrefix = apiType === "text" ? "ai:api" : "image:api";

    // Increment call counts
    if (isError) {
      pipeline.incr(`${metricPrefix}:errors`);
    }
    if (isCacheHit) {
      pipeline.incr(`${metricPrefix}:cache_hits`);
    } else {
      pipeline.incr(`${metricPrefix}:calls`);
      // Only track response time for actual API calls (not cache hits)
      pipeline.incrby(`${metricPrefix}:total_time`, responseTimeMs);
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
 * Get performance data for a specific API type
 * @param apiType Type of API ('text' or 'image')
 * @param startTime Start timestamp (ms)
 * @param endTime End timestamp (ms)
 */
const getApiPerformanceData = async (
  apiType: "text" | "image",
  startTime: number,
  endTime: number
) => {
  const metricPrefix = apiType === "text" ? "ai:api" : "image:api";
  const cachePrefix = apiType === "text" ? "ai:cache" : "image:cache";

  // Get counts from Redis
  const [apiCalls, apiErrors, apiTotalTime, cacheHits, cacheMisses] =
    await statsGetMulti([
      `${metricPrefix}:calls`,
      `${metricPrefix}:errors`,
      `${metricPrefix}:total_time`,
      `${cachePrefix}:hits`,
      `${cachePrefix}:misses`,
    ]);

  // Parse values
  const calls = parseInt(apiCalls || "0", 10);
  const errors = parseInt(apiErrors || "0", 10);
  const totalTime = parseInt(apiTotalTime || "0", 10);
  const hits = parseInt(cacheHits || "0", 10);
  const misses = parseInt(cacheMisses || "0", 10);

  // Calculate metrics
  const totalCalls = Math.max(1, calls); // Prevent division by zero
  const totalRequests = hits + misses;
  const avgResponseTime = Math.round(totalTime / totalCalls);
  const errorRate = Math.round((errors / totalCalls) * 100);
  const cacheHitRate =
    totalRequests > 0 ? Math.round((hits / totalRequests) * 100) : 0;

  // Get time-series data from Redis for response time distribution
  const timeseriesData = await getTimeSeriesData(apiType, startTime, endTime);

  return {
    totalCalls,
    errors,
    avgResponseTime,
    errorRate,
    cacheHits: hits,
    cacheMisses: misses,
    totalRequests,
    cacheHitRate,
    timeseriesData,
  };
};

/**
 * Get time-series data for response times
 * @param apiType Type of API ('text' or 'image')
 * @param startTime Start timestamp (ms)
 * @param endTime End timestamp (ms)
 */
const getTimeSeriesData = async (
  apiType: "text" | "image",
  startTime: number,
  endTime: number
) => {
  try {
    // Get date range
    const startDate = new Date(startTime);
    const endDate = new Date(endTime);

    // For simplicity, we'll just get the last 60 minutes of data
    // For a full implementation, you would iterate through all dates in the range
    const currentDate = new Date().toISOString().split("T")[0];
    const currentHour = new Date().getHours();

    // Create prefix for keys
    const keyPrefix =
      apiType === "text"
        ? KEY_PREFIXES.AI_RESPONSE_TIMES
        : KEY_PREFIXES.IMAGE_RESPONSE_TIMES;

    // Get keys for the current hour
    const keys = [];
    for (let minute = 0; minute < 60; minute++) {
      keys.push(`${keyPrefix}${currentDate}:${currentHour}:${minute}`);
    }

    // Get time-series data for each minute
    const pipeline = statsPipeline();
    keys.forEach((key) => pipeline.lrange(key, 0, -1));

    const results = await pipeline.exec();
    if (!results) {
      return [];
    }

    // Parse and flatten results
    const timeseriesData = [];
    results.forEach((result, index) => {
      const minuteData = result[1] as string[];
      if (minuteData && minuteData.length > 0) {
        minuteData.forEach((dataPoint) => {
          try {
            const data = JSON.parse(dataPoint);
            // Only include data points within the time range
            if (data.timestamp >= startTime && data.timestamp <= endTime) {
              timeseriesData.push(data);
            }
          } catch (e) {
            // Skip invalid data points
          }
        });
      }
    });

    // Sort by timestamp
    return timeseriesData.sort((a, b) => a.timestamp - b.timestamp);
  } catch (error) {
    console.error(`Error getting time-series data:`, error);
    return [];
  }
};

/**
 * Get AI response time data for monitoring
 */
export const getAIResponseTimeData = async (
  timeRange: string = "24h",
  limit: number = 100
) => {
  // Parse time range
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

  // Get response times (only last 'limit' number of points)
  const textResponseTimes = textApiData.timeseriesData
    .slice(-limit)
    .map((data) => ({
      timestamp: data.timestamp,
      responseTime: data.responseTime,
      isError: data.isError,
      isCacheHit: data.isCacheHit,
    }));

  const imageResponseTimes = imageApiData.timeseriesData
    .slice(-limit)
    .map((data) => ({
      timestamp: data.timestamp,
      responseTime: data.responseTime,
      isError: data.isError,
      isCacheHit: data.isCacheHit,
    }));

  // Calculate P95 response time
  const calcP95 = (times: number[]) => {
    if (times.length === 0) return 0;
    const sorted = [...times].sort((a, b) => a - b);
    const index = Math.floor(sorted.length * 0.95);
    return sorted[index] || sorted[sorted.length - 1];
  };

  // Extract just response times for p95 calculation
  const textResponseTimeValues = textResponseTimes.map((d) => d.responseTime);
  const imageResponseTimeValues = imageResponseTimes.map((d) => d.responseTime);

  return {
    timeRange,
    limit,
    timestamp: new Date().toISOString(),
    textApi: {
      responseTimes: textResponseTimes,
      avgResponseTime: textApiData.avgResponseTime,
      p95ResponseTime: calcP95(textResponseTimeValues),
      errorRate: textApiData.errorRate,
      cacheHitRate: textApiData.cacheHitRate,
    },
    imageApi: {
      responseTimes: imageResponseTimes,
      avgResponseTime: imageApiData.avgResponseTime,
      p95ResponseTime: calcP95(imageResponseTimeValues),
      errorRate: imageApiData.errorRate,
      cacheHitRate: imageApiData.cacheHitRate,
    },
  };
};
