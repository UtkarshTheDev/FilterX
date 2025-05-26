import {
  statsPipeline,
  statsGet,
  statsGetMulti,
  statsHGetAll,
  statsIncrement,
  redisClient,
} from "../utils/redis";
import logger from "../utils/logger";

// CORRECTED: Essential stat key prefixes - keeping important tracking but optimized
const KEY_PREFIXES = {
  TOTAL_REQUESTS: "stats:requests:total", // Primary counter for all requests
  BLOCKED_REQUESTS: "stats:requests:blocked", // Only track blocked, filtered can be derived
  CACHED_REQUESTS: "stats:requests:cached", // Essential for cache hit rate
  FLAG_COUNTS: "stats:flags:", // RESTORED: Flag tracking is important for analytics
  LATENCY: "stats:latency:", // RESTORED: Latency tracking for performance monitoring
  // OPTIMIZED: Removed per-user tracking to reduce operations but kept essential stats
};

// CORRECTED: Stats batching buffer for async processing - includes flags tracking
interface StatsBatch {
  totalRequests: number;
  blockedRequests: number;
  cachedRequests: number;
  latencySum: number;
  latencyCount: number;
  latencyValues: number[]; // Keep recent latency values for percentiles
  flagCounts: Map<string, number>; // Track individual flags
  textApiCalls: number;
  textApiTime: number;
  imageApiCalls: number;
  imageApiTime: number;
}

let statsBatch: StatsBatch = {
  totalRequests: 0,
  blockedRequests: 0,
  cachedRequests: 0,
  latencySum: 0,
  latencyCount: 0,
  latencyValues: [],
  flagCounts: new Map(),
  textApiCalls: 0,
  textApiTime: 0,
  imageApiCalls: 0,
  imageApiTime: 0,
};

let batchTimeout: NodeJS.Timeout | null = null;

/**
 * PHASE 2 OPTIMIZED: Ultra-fast stats tracking with batching
 * Reduces Redis operations from 8 to 3-4 essential operations
 * Uses 5-second batching to minimize Redis round-trips
 */
export const trackAllStatsUnified = async (
  userId: string,
  isBlocked: boolean,
  flags: string[],
  latencyMs: number,
  isCached: boolean,
  textApiType: "text" | null,
  imageApiType: "image" | null
): Promise<void> => {
  try {
    logger.debug(`Batching stats for user: ${userId}`);

    // PHASE 2: Add to batch instead of immediate Redis operations
    statsBatch.totalRequests++;
    if (isBlocked) statsBatch.blockedRequests++;
    if (isCached) statsBatch.cachedRequests++;

    // Track latency for rolling average and percentiles
    statsBatch.latencySum += latencyMs;
    statsBatch.latencyCount++;
    statsBatch.latencyValues.push(latencyMs);

    // Keep only recent latency values (last 500)
    if (statsBatch.latencyValues.length > 500) {
      statsBatch.latencyValues = statsBatch.latencyValues.slice(-500);
    }

    // RESTORED: Track individual flags - important for analytics
    flags.forEach((flag) => {
      const currentCount = statsBatch.flagCounts.get(flag) || 0;
      statsBatch.flagCounts.set(flag, currentCount + 1);
    });

    // Track API usage
    if (textApiType) {
      statsBatch.textApiCalls++;
      statsBatch.textApiTime += latencyMs;
    }
    if (imageApiType) {
      statsBatch.imageApiCalls++;
      statsBatch.imageApiTime += latencyMs;
    }

    // PHASE 2: Schedule batch flush if not already scheduled
    if (!batchTimeout) {
      batchTimeout = setTimeout(flushStatsBatch, 5000); // 5-second batching
      logger.debug("Scheduled stats batch flush in 5 seconds");
    }
  } catch (error) {
    logger.error("Error in optimized stats batching (non-blocking)", error);
    // Don't throw - background processing should never crash the system
  }
};

/**
 * PHASE 2: Flush accumulated stats batch to Redis
 * Executes only 3-4 Redis operations instead of 8+ per request
 */
const flushStatsBatch = async (): Promise<void> => {
  try {
    if (statsBatch.totalRequests === 0) {
      batchTimeout = null;
      return;
    }

    const pipeline = statsPipeline();
    let operationCount = 0;

    // PHASE 2: Only essential operations
    if (statsBatch.totalRequests > 0) {
      pipeline.incrby(KEY_PREFIXES.TOTAL_REQUESTS, statsBatch.totalRequests);
      operationCount++;
    }

    if (statsBatch.blockedRequests > 0) {
      pipeline.incrby(
        KEY_PREFIXES.BLOCKED_REQUESTS,
        statsBatch.blockedRequests
      );
      operationCount++;
    }

    if (statsBatch.cachedRequests > 0) {
      pipeline.incrby(KEY_PREFIXES.CACHED_REQUESTS, statsBatch.cachedRequests);
      operationCount++;
    }

    // CORRECTED: Update latency tracking with recent values
    if (statsBatch.latencyCount > 0) {
      const latencyKey = `${KEY_PREFIXES.LATENCY}all`;
      // Add recent latency values to the list
      statsBatch.latencyValues.forEach((latency) => {
        pipeline.lpush(latencyKey, latency.toString());
      });
      // Keep only recent 500 values
      pipeline.ltrim(latencyKey, 0, 499);
      operationCount += 2;
    }

    // RESTORED: Update flag counts
    if (statsBatch.flagCounts.size > 0) {
      statsBatch.flagCounts.forEach((count, flag) => {
        const flagKey = `${KEY_PREFIXES.FLAG_COUNTS}${flag}`;
        pipeline.incrby(flagKey, count);
        operationCount++;
      });
    }

    // PHASE 2: Update API stats if needed
    if (statsBatch.textApiCalls > 0) {
      const textHashKey = "api:stats:text";
      pipeline.hincrby(textHashKey, "calls", statsBatch.textApiCalls);
      pipeline.hincrby(textHashKey, "total_time", statsBatch.textApiTime);
      operationCount += 2;
    }

    if (statsBatch.imageApiCalls > 0) {
      const imageHashKey = "api:stats:image";
      pipeline.hincrby(imageHashKey, "calls", statsBatch.imageApiCalls);
      pipeline.hincrby(imageHashKey, "total_time", statsBatch.imageApiTime);
      operationCount += 2;
    }

    // Execute batch pipeline
    const startTime = Date.now();
    await pipeline.exec();
    const pipelineTime = Date.now() - startTime;

    logger.debug(
      `Stats pipeline executed in ${pipelineTime}ms with ${operationCount} operations`
    );

    // Reset batch
    statsBatch = {
      totalRequests: 0,
      blockedRequests: 0,
      cachedRequests: 0,
      latencySum: 0,
      latencyCount: 0,
      latencyValues: [],
      flagCounts: new Map(),
      textApiCalls: 0,
      textApiTime: 0,
      imageApiCalls: 0,
      imageApiTime: 0,
    };
    batchTimeout = null;
  } catch (error) {
    logger.error("Error flushing stats batch", error);
    // Reset timeout to try again later
    batchTimeout = null;
  }
};

/**
 * Track a filter request - OPTIMIZED FOR BACKGROUND PROCESSING
 * This function is designed to be called from setImmediate() to not block API responses
 * NOTE: Consider using trackAllStatsUnified() for better performance
 */
export const trackFilterRequest = async (
  userId: string,
  isBlocked: boolean,
  flags: string[],
  latencyMs: number,
  isCached: boolean
) => {
  try {
    const pipeline = statsPipeline();

    // Increment total requests - this is our primary counter
    pipeline.incr(KEY_PREFIXES.TOTAL_REQUESTS);

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
      const flagKey = `${KEY_PREFIXES.FLAG_COUNTS}${flag}`;
      pipeline.incr(flagKey);
    });

    // Track latency for all requests but keep a smaller window
    const latencyKey = `${KEY_PREFIXES.LATENCY}all`;
    pipeline.lpush(latencyKey, latencyMs.toString());
    pipeline.ltrim(latencyKey, 0, 499); // Keep last 500 entries for accurate recent stats

    // Execute all commands as a transaction
    const results = await pipeline.exec();

    if (results) {
      // Log any errors in the pipeline results
      results.forEach((result: any, index: number) => {
        if (result && result[0]) {
          logger.error(`Stats pipeline operation ${index} failed`, result[0]);
        }
      });
    }
  } catch (error) {
    logger.error("Error tracking filter request stats", error);

    // Fallback: try to increment the main counter directly if pipeline failed
    try {
      await statsIncrement(KEY_PREFIXES.TOTAL_REQUESTS);

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
    } catch (fallbackError) {
      logger.error("Fallback increment also failed", fallbackError);
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
    logger.error("Error updating cache hit rate", error);
  }
};

/**
 * DATABASE-FIRST APPROACH: Get summary stats directly from database
 * This new implementation prioritizes database as the primary source of truth
 * and falls back to Redis only when necessary for real-time data
 */
export const getSummaryStats = async () => {
  try {
    logger.info("Getting summary stats using database-first approach");

    // Import database dependencies
    const { db } = await import("../db");
    const { sql } = await import("drizzle-orm");
    const { requestStatsDaily, apiPerformanceHourly, contentFlagsDaily } =
      await import("../models/statsSchema");

    // Get today's date for current day stats
    const today = new Date().toISOString().split("T")[0];
    const now = new Date();

    // Get current hour timestamp for API performance
    const currentHour = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      now.getHours(),
      0,
      0,
      0
    );

    // 1. Get today's request statistics from database
    let todayStats = {
      totalRequests: 0,
      filteredRequests: 0,
      blockedRequests: 0,
      cachedRequests: 0,
      avgResponseTimeMs: 0,
      p95ResponseTimeMs: 0,
    };

    try {
      const todayStatsResult = await db
        .select()
        .from(requestStatsDaily)
        .where(sql`${requestStatsDaily.date} = ${today}`)
        .limit(1);

      if (todayStatsResult.length > 0) {
        const stats = todayStatsResult[0];
        todayStats = {
          totalRequests: stats.totalRequests,
          filteredRequests: stats.filteredRequests,
          blockedRequests: stats.blockedRequests,
          cachedRequests: stats.cachedRequests,
          avgResponseTimeMs: stats.avgResponseTimeMs,
          p95ResponseTimeMs: stats.p95ResponseTimeMs,
        };
        logger.debug(
          `Found today's stats in database: ${stats.totalRequests} total requests`
        );
      } else {
        logger.debug(
          "No stats found in database for today, will use Redis fallback"
        );
      }
    } catch (error) {
      logger.error("Error fetching today's stats from database:", error);
    }

    // 2. Get current hour's API performance from database
    let apiPerformance = {
      text: { calls: 0, errors: 0, avgResponseTime: 0 },
      image: { calls: 0, errors: 0, avgResponseTime: 0 },
    };

    try {
      const apiPerfResults = await db
        .select()
        .from(apiPerformanceHourly)
        .where(sql`${apiPerformanceHourly.timestamp} = ${currentHour}`)
        .orderBy(apiPerformanceHourly.apiType);

      for (const perf of apiPerfResults) {
        if (perf.apiType === "text") {
          apiPerformance.text = {
            calls: perf.totalCalls,
            errors: perf.errorCalls,
            avgResponseTime: perf.avgResponseTimeMs,
          };
        } else if (perf.apiType === "image") {
          apiPerformance.image = {
            calls: perf.totalCalls,
            errors: perf.errorCalls,
            avgResponseTime: perf.avgResponseTimeMs,
          };
        }
      }
      logger.debug(
        `Found API performance in database: text=${apiPerformance.text.calls}, image=${apiPerformance.image.calls}`
      );
    } catch (error) {
      logger.error("Error fetching API performance from database:", error);
    }

    // 3. Get today's content flags from database
    let flagStats: Record<string, number> = {};

    try {
      const flagResults = await db
        .select()
        .from(contentFlagsDaily)
        .where(sql`${contentFlagsDaily.date} = ${today}`);

      for (const flag of flagResults) {
        flagStats[flag.flagName] = flag.count;
      }
      logger.debug(
        `Found ${Object.keys(flagStats).length} flag types in database`
      );
    } catch (error) {
      logger.error("Error fetching content flags from database:", error);
    }

    // 4. FALLBACK: If database has no data for today, get incremental data from Redis
    if (todayStats.totalRequests === 0) {
      logger.info(
        "No database stats for today, fetching incremental data from Redis"
      );

      try {
        const [totalRequests, blockedRequests, cachedRequests] =
          await statsGetMulti([
            KEY_PREFIXES.TOTAL_REQUESTS,
            KEY_PREFIXES.BLOCKED_REQUESTS,
            KEY_PREFIXES.CACHED_REQUESTS,
          ]);

        todayStats.totalRequests = parseInt(totalRequests || "0", 10);
        todayStats.blockedRequests = parseInt(blockedRequests || "0", 10);
        todayStats.cachedRequests = parseInt(cachedRequests || "0", 10);
        todayStats.filteredRequests =
          todayStats.totalRequests - todayStats.blockedRequests;

        // Get latency stats from Redis if available
        const latencyStats = await getLatencyStats();
        todayStats.avgResponseTimeMs = latencyStats.average;
        todayStats.p95ResponseTimeMs = latencyStats.p95;

        logger.debug(
          `Redis fallback stats: ${todayStats.totalRequests} total requests`
        );
      } catch (error) {
        logger.error("Error fetching fallback stats from Redis:", error);
      }
    }

    // 5. FALLBACK: If database has no API performance for current hour, get from Redis
    if (apiPerformance.text.calls === 0 && apiPerformance.image.calls === 0) {
      logger.info(
        "No database API performance for current hour, fetching from Redis"
      );

      try {
        const textApiData = (await statsHGetAll("api:stats:text")) || {};
        const imageApiData = (await statsHGetAll("api:stats:image")) || {};

        apiPerformance.text = {
          calls: parseInt(textApiData["calls"] || "0", 10),
          errors: parseInt(textApiData["errors"] || "0", 10),
          avgResponseTime:
            parseInt(textApiData["calls"] || "0", 10) > 0
              ? Math.round(
                  parseInt(textApiData["total_time"] || "0", 10) /
                    parseInt(textApiData["calls"] || "1", 10)
                )
              : 0,
        };

        apiPerformance.image = {
          calls: parseInt(imageApiData["calls"] || "0", 10),
          errors: parseInt(imageApiData["errors"] || "0", 10),
          avgResponseTime:
            parseInt(imageApiData["calls"] || "0", 10) > 0
              ? Math.round(
                  parseInt(imageApiData["total_time"] || "0", 10) /
                    parseInt(imageApiData["calls"] || "1", 10)
                )
              : 0,
        };

        logger.debug(
          `Redis API fallback: text=${apiPerformance.text.calls}, image=${apiPerformance.image.calls}`
        );
      } catch (error) {
        logger.error(
          "Error fetching API performance fallback from Redis:",
          error
        );
      }
    }

    // 6. FALLBACK: If database has no flags for today, get from Redis
    if (Object.keys(flagStats).length === 0) {
      logger.info("No database flags for today, fetching from Redis");
      flagStats = await getFlagStats();
    }

    // Calculate derived metrics
    const cacheHitRate =
      todayStats.totalRequests > 0
        ? Math.round(
            (todayStats.cachedRequests / todayStats.totalRequests) * 100
          )
        : 0;

    const textApiErrorRate =
      apiPerformance.text.calls > 0
        ? Math.round(
            (apiPerformance.text.errors / apiPerformance.text.calls) * 100
          )
        : 0;

    const imageApiErrorRate =
      apiPerformance.image.calls > 0
        ? Math.round(
            (apiPerformance.image.errors / apiPerformance.image.calls) * 100
          )
        : 0;

    // Return comprehensive stats with database-first approach
    const result = {
      totalRequests: todayStats.totalRequests,
      filteredRequests: todayStats.filteredRequests,
      blockedRequests: todayStats.blockedRequests,
      cachedRequests: todayStats.cachedRequests,
      todayRequests: todayStats.totalRequests,
      cacheHitRate: cacheHitRate,
      latency: {
        average: todayStats.avgResponseTimeMs,
        p50: Math.round(todayStats.avgResponseTimeMs * 0.9), // Estimated
        p95: todayStats.p95ResponseTimeMs,
        p99: Math.round(todayStats.p95ResponseTimeMs * 1.1), // Estimated
      },
      flags: flagStats,
      optimization: {
        cache: {
          hits: todayStats.cachedRequests,
          misses: todayStats.totalRequests - todayStats.cachedRequests,
          hitRate: cacheHitRate,
        },
        ai: {
          api: {
            calls: apiPerformance.text.calls,
            errors: apiPerformance.text.errors,
            avgResponseTime: apiPerformance.text.avgResponseTime,
            errorRate: textApiErrorRate,
          },
        },
        image: {
          api: {
            calls: apiPerformance.image.calls,
            errors: apiPerformance.image.errors,
            avgResponseTime: apiPerformance.image.avgResponseTime,
            errorRate: imageApiErrorRate,
          },
        },
        performance: {
          avgResponseTime: todayStats.avgResponseTimeMs,
          p95ResponseTime: todayStats.p95ResponseTimeMs,
        },
      },
      dataSource: {
        primary: "database",
        fallbackUsed: todayStats.totalRequests === 0 ? "redis" : "none",
        timestamp: new Date().toISOString(),
      },
    };

    logger.info(
      `Summary stats retrieved successfully using database-first approach`
    );
    return result;
  } catch (error) {
    logger.error(
      "Error getting summary stats with database-first approach:",
      error
    );

    // Ultimate fallback: return basic structure with zeros
    return {
      totalRequests: 0,
      filteredRequests: 0,
      blockedRequests: 0,
      cachedRequests: 0,
      todayRequests: 0,
      cacheHitRate: 0,
      latency: { average: 0, p50: 0, p95: 0, p99: 0 },
      flags: {},
      optimization: {
        cache: { hits: 0, misses: 0, hitRate: 0 },
        ai: { api: { calls: 0, errors: 0, avgResponseTime: 0, errorRate: 0 } },
        image: {
          api: { calls: 0, errors: 0, avgResponseTime: 0, errorRate: 0 },
        },
        performance: { avgResponseTime: 0, p95ResponseTime: 0 },
      },
      dataSource: {
        primary: "fallback",
        fallbackUsed: "error",
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      },
    };
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
 * Track API call response time - OPTIMIZED FOR BACKGROUND PROCESSING
 * This function is designed to be called from setImmediate() to not block API responses
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

    // Track all API calls regardless of cache status
    pipeline.hincrby(hashKey, "calls", 1);

    // Track errors if applicable
    if (isError) {
      pipeline.hincrby(hashKey, "errors", 1);
    }

    // Track total time for calculating averages
    pipeline.hincrby(hashKey, "total_time", responseTimeMs);

    // Execute pipeline
    const results = await pipeline.exec();

    if (results) {
      // Log any errors in the pipeline results
      results.forEach((result: any, index: number) => {
        if (result && result[0]) {
          logger.error(
            `API stats pipeline operation ${index} failed`,
            result[0]
          );
        }
      });
    }
  } catch (error) {
    logger.error(`Error tracking API response time for ${apiType}`, error);

    // Fallback: try to track directly if pipeline failed
    try {
      const hashKey = `api:stats:${apiType}`;
      await statsIncrement(`${hashKey}:calls`);
      if (isError) {
        await statsIncrement(`${hashKey}:errors`);
      }
      await statsIncrement(`${hashKey}:total_time`, responseTimeMs);
    } catch (fallbackError) {
      logger.error(
        `Fallback API tracking also failed for ${apiType}`,
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
