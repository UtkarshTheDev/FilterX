/**
 * Performance Monitoring Utility for FilterX API
 * Tracks the impact of Phase 1 optimizations
 */

interface PerformanceMetrics {
  requestId: string;
  startTime: number;
  endTime?: number;
  coreProcessingTime?: number;
  backgroundTasksTime?: number;
  cacheHit: boolean;
  aiUsed: boolean;
  responseSize: number;
  userId: string;
}

class PerformanceMonitor {
  private metrics: Map<string, PerformanceMetrics> = new Map();
  private backgroundTaskQueue: Array<() => Promise<void>> = [];
  private isProcessingBackground = false;

  /**
   * Start tracking a request
   */
  startRequest(requestId: string, userId: string): void {
    this.metrics.set(requestId, {
      requestId,
      startTime: performance.now(),
      cacheHit: false,
      aiUsed: false,
      responseSize: 0,
      userId,
    });
  }

  /**
   * Mark core processing complete (when response is sent)
   */
  markCoreComplete(requestId: string, cacheHit: boolean, aiUsed: boolean): void {
    const metric = this.metrics.get(requestId);
    if (metric) {
      metric.coreProcessingTime = performance.now() - metric.startTime;
      metric.cacheHit = cacheHit;
      metric.aiUsed = aiUsed;
    }
  }

  /**
   * Mark request complete (including background tasks)
   */
  completeRequest(requestId: string, responseSize: number): void {
    const metric = this.metrics.get(requestId);
    if (metric) {
      metric.endTime = performance.now();
      metric.backgroundTasksTime = metric.endTime - metric.startTime - (metric.coreProcessingTime || 0);
      metric.responseSize = responseSize;
      
      // Log performance summary
      this.logPerformanceSummary(metric);
      
      // Clean up after logging
      setTimeout(() => this.metrics.delete(requestId), 5000);
    }
  }

  /**
   * Queue a background task for monitoring
   */
  queueBackgroundTask(task: () => Promise<void>): void {
    this.backgroundTaskQueue.push(task);
    this.processBackgroundQueue();
  }

  /**
   * Process background task queue
   */
  private async processBackgroundQueue(): Promise<void> {
    if (this.isProcessingBackground || this.backgroundTaskQueue.length === 0) {
      return;
    }

    this.isProcessingBackground = true;
    
    while (this.backgroundTaskQueue.length > 0) {
      const task = this.backgroundTaskQueue.shift();
      if (task) {
        try {
          await task();
        } catch (error) {
          console.error('[Performance] Background task failed:', error);
        }
      }
    }
    
    this.isProcessingBackground = false;
  }

  /**
   * Log performance summary for analysis
   */
  private logPerformanceSummary(metric: PerformanceMetrics): void {
    const totalTime = metric.endTime! - metric.startTime;
    const coreTime = metric.coreProcessingTime || 0;
    const backgroundTime = metric.backgroundTasksTime || 0;
    
    console.log(`
🚀 [Performance Summary] Request ${metric.requestId}
├── Total Time: ${totalTime.toFixed(2)}ms
├── Core Processing: ${coreTime.toFixed(2)}ms (${((coreTime / totalTime) * 100).toFixed(1)}%)
├── Background Tasks: ${backgroundTime.toFixed(2)}ms (${((backgroundTime / totalTime) * 100).toFixed(1)}%)
├── Cache Hit: ${metric.cacheHit ? '✅' : '❌'}
├── AI Used: ${metric.aiUsed ? '🤖' : '📋'}
├── Response Size: ${metric.responseSize} bytes
└── User: ${metric.userId}
    `);
  }

  /**
   * Get performance statistics
   */
  getStats(): {
    activeRequests: number;
    avgCoreTime: number;
    avgBackgroundTime: number;
    cacheHitRate: number;
    aiUsageRate: number;
  } {
    const completedMetrics = Array.from(this.metrics.values()).filter(m => m.endTime);
    
    if (completedMetrics.length === 0) {
      return {
        activeRequests: this.metrics.size,
        avgCoreTime: 0,
        avgBackgroundTime: 0,
        cacheHitRate: 0,
        aiUsageRate: 0,
      };
    }

    const avgCoreTime = completedMetrics.reduce((sum, m) => sum + (m.coreProcessingTime || 0), 0) / completedMetrics.length;
    const avgBackgroundTime = completedMetrics.reduce((sum, m) => sum + (m.backgroundTasksTime || 0), 0) / completedMetrics.length;
    const cacheHits = completedMetrics.filter(m => m.cacheHit).length;
    const aiUsage = completedMetrics.filter(m => m.aiUsed).length;

    return {
      activeRequests: this.metrics.size,
      avgCoreTime: Math.round(avgCoreTime * 100) / 100,
      avgBackgroundTime: Math.round(avgBackgroundTime * 100) / 100,
      cacheHitRate: Math.round((cacheHits / completedMetrics.length) * 100),
      aiUsageRate: Math.round((aiUsage / completedMetrics.length) * 100),
    };
  }

  /**
   * Generate performance report
   */
  generateReport(): string {
    const stats = this.getStats();
    
    return `
📊 FilterX Performance Report (Phase 1 Optimizations)
═══════════════════════════════════════════════════
🔄 Active Requests: ${stats.activeRequests}
⚡ Avg Core Processing: ${stats.avgCoreTime}ms
🔄 Avg Background Tasks: ${stats.avgBackgroundTime}ms
💾 Cache Hit Rate: ${stats.cacheHitRate}%
🤖 AI Usage Rate: ${stats.aiUsageRate}%

🎯 Optimization Impact:
• Response-first pattern ensures API responds in ~${stats.avgCoreTime}ms
• Background tasks add ${stats.avgBackgroundTime}ms but don't block responses
• ${stats.cacheHitRate}% of requests served from cache
• Only ${stats.aiUsageRate}% of requests require AI processing
    `;
  }
}

// Export singleton instance
export const performanceMonitor = new PerformanceMonitor();

/**
 * Utility function to generate unique request IDs
 */
export const generateRequestId = (): string => {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Utility function to measure response size
 */
export const measureResponseSize = (response: any): number => {
  try {
    return JSON.stringify(response).length;
  } catch {
    return 0;
  }
};
