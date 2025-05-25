import logger from "./logger";
import { config } from "../config";

// Cache performance metrics
interface CacheMetrics {
  timestamp: number;
  hitRate: number;
  memoryUsage: number;
  entryCount: number;
  evictions: number;
  compressionRatio: number;
  avgResponseTime: number;
}

// Cache health status
interface CacheHealth {
  status: "healthy" | "warning" | "critical";
  issues: string[];
  recommendations: string[];
  metrics: CacheMetrics;
}

/**
 * Cache Monitor - Tracks cache performance and provides optimization recommendations
 */
export class CacheMonitor {
  private metrics: CacheMetrics[] = [];
  private readonly maxMetricsHistory = 100;
  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor() {
    logger.info("Cache monitor initialized");
  }

  /**
   * Start monitoring cache performance
   */
  startMonitoring(intervalMs: number = 60000): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    this.monitoringInterval = setInterval(() => {
      this.collectMetrics();
    }, intervalMs);

    logger.info(`Cache monitoring started with ${intervalMs}ms interval`);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.info("Cache monitoring stopped");
    }
  }

  /**
   * Collect current cache metrics
   */
  private collectMetrics(): void {
    try {
      // This would be called with actual cache instances
      // For now, we'll create a placeholder structure
      const metric: CacheMetrics = {
        timestamp: Date.now(),
        hitRate: 0,
        memoryUsage: 0,
        entryCount: 0,
        evictions: 0,
        compressionRatio: 0,
        avgResponseTime: 0,
      };

      this.addMetric(metric);
    } catch (error) {
      logger.error("Error collecting cache metrics:", error);
    }
  }

  /**
   * Add a metric to the history
   */
  addMetric(metric: CacheMetrics): void {
    this.metrics.push(metric);

    // Keep only recent metrics
    if (this.metrics.length > this.maxMetricsHistory) {
      this.metrics = this.metrics.slice(-this.maxMetricsHistory);
    }
  }

  /**
   * Get cache health assessment
   */
  getCacheHealth(): CacheHealth {
    if (this.metrics.length === 0) {
      return {
        status: "warning",
        issues: ["No metrics available"],
        recommendations: ["Start cache monitoring"],
        metrics: this.getDefaultMetrics(),
      };
    }

    const latestMetric = this.metrics[this.metrics.length - 1];
    const issues: string[] = [];
    const recommendations: string[] = [];
    let status: "healthy" | "warning" | "critical" = "healthy";

    // Analyze hit rate
    if (latestMetric.hitRate < 50) {
      status = "warning";
      issues.push(`Low cache hit rate: ${latestMetric.hitRate}%`);
      recommendations.push("Consider increasing cache size or TTL values");
    } else if (latestMetric.hitRate < 30) {
      status = "critical";
      issues.push(`Very low cache hit rate: ${latestMetric.hitRate}%`);
      recommendations.push("Review cache key generation and TTL strategy");
    }

    // Analyze memory usage
    const memoryUsagePercent =
      (latestMetric.memoryUsage /
        (config.caching.routeCacheMemoryMB * 1024 * 1024)) *
      100;
    if (memoryUsagePercent > 90) {
      status = "critical";
      issues.push(`High memory usage: ${memoryUsagePercent.toFixed(1)}%`);
      recommendations.push("Increase memory limit or reduce cache size");
    } else if (memoryUsagePercent > 75) {
      if (status === "healthy") status = "warning";
      issues.push(`Moderate memory usage: ${memoryUsagePercent.toFixed(1)}%`);
      recommendations.push("Monitor memory usage trends");
    }

    // Analyze eviction rate
    const recentEvictions = this.getRecentEvictionRate();
    if (recentEvictions > 10) {
      if (status === "healthy") status = "warning";
      issues.push(`High eviction rate: ${recentEvictions} evictions/min`);
      recommendations.push("Consider increasing cache size or optimizing TTL");
    }

    // Analyze compression effectiveness
    if (
      latestMetric.compressionRatio < 10 &&
      config.caching.compressionEnabled
    ) {
      issues.push(`Low compression ratio: ${latestMetric.compressionRatio}%`);
      recommendations.push("Review compression threshold settings");
    }

    return {
      status,
      issues,
      recommendations,
      metrics: latestMetric,
    };
  }

  /**
   * Get recent eviction rate (evictions per minute)
   */
  private getRecentEvictionRate(): number {
    if (this.metrics.length < 2) return 0;

    const recent = this.metrics.slice(-5); // Last 5 metrics
    const timeSpan = recent[recent.length - 1].timestamp - recent[0].timestamp;
    const evictionDiff =
      recent[recent.length - 1].evictions - recent[0].evictions;

    return timeSpan > 0 ? (evictionDiff / timeSpan) * 60000 : 0; // Per minute
  }

  /**
   * Get performance trends
   */
  getPerformanceTrends(): {
    hitRateTrend: "increasing" | "decreasing" | "stable";
    memoryTrend: "increasing" | "decreasing" | "stable";
    evictionTrend: "increasing" | "decreasing" | "stable";
  } {
    if (this.metrics.length < 10) {
      return {
        hitRateTrend: "stable",
        memoryTrend: "stable",
        evictionTrend: "stable",
      };
    }

    const recent = this.metrics.slice(-10);
    const older = this.metrics.slice(-20, -10);

    const avgRecentHitRate =
      recent.reduce((sum, m) => sum + m.hitRate, 0) / recent.length;
    const avgOlderHitRate =
      older.reduce((sum, m) => sum + m.hitRate, 0) / older.length;

    const avgRecentMemory =
      recent.reduce((sum, m) => sum + m.memoryUsage, 0) / recent.length;
    const avgOlderMemory =
      older.reduce((sum, m) => sum + m.memoryUsage, 0) / older.length;

    const avgRecentEvictions =
      recent.reduce((sum, m) => sum + m.evictions, 0) / recent.length;
    const avgOlderEvictions =
      older.reduce((sum, m) => sum + m.evictions, 0) / older.length;

    return {
      hitRateTrend: this.getTrend(avgRecentHitRate, avgOlderHitRate),
      memoryTrend: this.getTrend(avgRecentMemory, avgOlderMemory),
      evictionTrend: this.getTrend(avgRecentEvictions, avgOlderEvictions),
    };
  }

  /**
   * Determine trend direction
   */
  private getTrend(
    recent: number,
    older: number
  ): "increasing" | "decreasing" | "stable" {
    const threshold = 0.05; // 5% threshold for stability
    const change = (recent - older) / older;

    if (Math.abs(change) < threshold) return "stable";
    return change > 0 ? "increasing" : "decreasing";
  }

  /**
   * Get optimization recommendations
   */
  getOptimizationRecommendations(): string[] {
    const health = this.getCacheHealth();
    const trends = this.getPerformanceTrends();
    const recommendations: string[] = [...health.recommendations];

    // Add trend-based recommendations
    if (trends.hitRateTrend === "decreasing") {
      recommendations.push(
        "Hit rate is decreasing - review cache key strategy"
      );
    }

    if (trends.memoryTrend === "increasing") {
      recommendations.push(
        "Memory usage is increasing - consider compression or size limits"
      );
    }

    if (trends.evictionTrend === "increasing") {
      recommendations.push(
        "Eviction rate is increasing - consider larger cache or better TTL"
      );
    }

    // Remove duplicates
    return [...new Set(recommendations)];
  }

  /**
   * Get default metrics when no data is available
   */
  private getDefaultMetrics(): CacheMetrics {
    return {
      timestamp: Date.now(),
      hitRate: 0,
      memoryUsage: 0,
      entryCount: 0,
      evictions: 0,
      compressionRatio: 0,
      avgResponseTime: 0,
    };
  }

  /**
   * Export metrics for external analysis
   */
  exportMetrics(): CacheMetrics[] {
    return [...this.metrics];
  }

  /**
   * Clear metrics history
   */
  clearMetrics(): void {
    this.metrics = [];
    logger.info("Cache metrics history cleared");
  }

  /**
   * Get summary statistics
   */
  getSummaryStats(): {
    totalMetrics: number;
    avgHitRate: number;
    avgMemoryUsage: number;
    totalEvictions: number;
    timeSpan: number;
  } {
    if (this.metrics.length === 0) {
      return {
        totalMetrics: 0,
        avgHitRate: 0,
        avgMemoryUsage: 0,
        totalEvictions: 0,
        timeSpan: 0,
      };
    }

    const avgHitRate =
      this.metrics.reduce((sum, m) => sum + m.hitRate, 0) / this.metrics.length;
    const avgMemoryUsage =
      this.metrics.reduce((sum, m) => sum + m.memoryUsage, 0) /
      this.metrics.length;
    const totalEvictions = this.metrics[this.metrics.length - 1].evictions;
    const timeSpan =
      this.metrics[this.metrics.length - 1].timestamp -
      this.metrics[0].timestamp;

    return {
      totalMetrics: this.metrics.length,
      avgHitRate: Math.round(avgHitRate * 100) / 100,
      avgMemoryUsage: Math.round(avgMemoryUsage),
      totalEvictions,
      timeSpan,
    };
  }
}

// Export singleton instance
export const cacheMonitor = new CacheMonitor();
