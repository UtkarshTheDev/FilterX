import logger from "./logger";
import { config } from "../config";
import {
  compressIfBeneficial,
  decompressIfNeeded,
  isCompressed,
} from "./cacheCompression";

// Advanced cache entry with frequency and access tracking
interface AdvancedCacheEntry {
  data: any;
  expiry: number;
  frequency: number;
  lastAccess: number;
  size: number; // Estimated size in bytes
  createdAt: number;
  compressed: boolean; // Whether data is compressed
}

// Cache statistics for monitoring
interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  totalSize: number;
  entryCount: number;
  hitRate: string;
  avgFrequency: number;
  memoryUsage: string;
}

// Eviction policies
enum EvictionPolicy {
  LRU = "lru",
  LFU = "lfu",
  TIME_AWARE = "time_aware",
  HYBRID = "hybrid",
}

/**
 * Advanced Route Cache with multiple eviction policies and intelligent memory management
 * Supports LRU, LFU, Time-Aware, and Hybrid eviction strategies
 */
export class AdvancedRouteCache {
  private cache: Map<string, AdvancedCacheEntry> = new Map();
  private readonly maxSize: number;
  private readonly maxMemoryBytes: number;
  private readonly defaultTTL: number;
  private readonly evictionPolicy: EvictionPolicy;

  // Statistics tracking
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    totalSize: 0,
    entryCount: 0,
    hitRate: "0%",
    avgFrequency: 0,
    memoryUsage: "0 MB",
  };

  // Cleanup interval
  private cleanupInterval: NodeJS.Timeout;

  constructor(
    maxSize: number = 1000,
    defaultTTLSeconds: number = 60,
    maxMemoryMB: number = 50,
    evictionPolicy: EvictionPolicy = EvictionPolicy.HYBRID
  ) {
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTLSeconds * 1000;
    this.maxMemoryBytes = maxMemoryMB * 1024 * 1024; // Convert MB to bytes
    this.evictionPolicy = evictionPolicy;

    logger.info(
      `Initialized advanced route cache: maxSize=${maxSize}, TTL=${defaultTTLSeconds}s, ` +
        `maxMemory=${maxMemoryMB}MB, policy=${evictionPolicy}`
    );

    // Start periodic cleanup
    this.cleanupInterval = setInterval(() => this.performMaintenance(), 30000); // Every 30 seconds
  }

  /**
   * Get item from cache with frequency tracking
   */
  get(key: string): any {
    const entry = this.cache.get(key);
    const now = Date.now();

    // Check if entry exists and is not expired
    if (!entry || entry.expiry < now) {
      if (entry) {
        this.cache.delete(key);
        this.updateStats();
      }
      this.stats.misses++;
      return null;
    }

    // Update access patterns
    entry.frequency++;
    entry.lastAccess = now;

    // Move to end for LRU behavior (Map maintains insertion order)
    this.cache.delete(key);
    this.cache.set(key, entry);

    this.stats.hits++;

    // Return decompressed data if needed
    return entry.compressed ? decompressIfNeeded(entry.data) : entry.data;
  }

  /**
   * Set item in cache with intelligent eviction
   */
  set(key: string, value: any, ttlMs?: number): void {
    const now = Date.now();
    const expiryTime = now + (ttlMs || this.defaultTTL);

    // Compress data if beneficial
    const compressedData = compressIfBeneficial(value);
    const isDataCompressed = isCompressed(compressedData);
    const estimatedSize = this.estimateSize(
      isDataCompressed ? compressedData : value
    );

    const entry: AdvancedCacheEntry = {
      data: isDataCompressed ? compressedData : value,
      expiry: expiryTime,
      frequency: 1,
      lastAccess: now,
      size: estimatedSize,
      createdAt: now,
      compressed: isDataCompressed,
    };

    // Check if we need to evict before adding
    this.ensureCapacity(estimatedSize);

    this.cache.set(key, entry);
    this.updateStats();
  }

  /**
   * Ensure cache has capacity for new entry
   */
  private ensureCapacity(newEntrySize: number): void {
    // Check size limit
    while (this.cache.size >= this.maxSize) {
      this.evictOne();
    }

    // Check memory limit
    while (this.stats.totalSize + newEntrySize > this.maxMemoryBytes) {
      this.evictOne();
    }
  }

  /**
   * Evict one entry based on the configured policy
   */
  private evictOne(): void {
    if (this.cache.size === 0) return;

    let keyToEvict: string;

    switch (this.evictionPolicy) {
      case EvictionPolicy.LRU:
        keyToEvict = this.findLRUKey();
        break;
      case EvictionPolicy.LFU:
        keyToEvict = this.findLFUKey();
        break;
      case EvictionPolicy.TIME_AWARE:
        keyToEvict = this.findTimeAwareKey();
        break;
      case EvictionPolicy.HYBRID:
      default:
        keyToEvict = this.findHybridKey();
        break;
    }

    if (keyToEvict) {
      this.cache.delete(keyToEvict);
      this.stats.evictions++;
      this.updateStats();
    }
  }

  /**
   * Find least recently used key
   */
  private findLRUKey(): string {
    let oldestKey = "";
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache) {
      if (entry.lastAccess < oldestTime) {
        oldestTime = entry.lastAccess;
        oldestKey = key;
      }
    }

    return oldestKey;
  }

  /**
   * Find least frequently used key
   */
  private findLFUKey(): string {
    let lfuKey = "";
    let minFrequency = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.frequency < minFrequency) {
        minFrequency = entry.frequency;
        lfuKey = key;
      }
    }

    return lfuKey;
  }

  /**
   * Find key using time-aware strategy (considers age and TTL)
   */
  private findTimeAwareKey(): string {
    let targetKey = "";
    let highestScore = -1;
    const now = Date.now();

    for (const [key, entry] of this.cache) {
      // Score based on age and remaining TTL
      const age = now - entry.createdAt;
      const remainingTTL = entry.expiry - now;
      const ageRatio = age / (entry.expiry - entry.createdAt);

      // Higher score = better candidate for eviction
      const score = ageRatio + 1 / (entry.frequency + 1);

      if (score > highestScore) {
        highestScore = score;
        targetKey = key;
      }
    }

    return targetKey;
  }

  /**
   * Find key using hybrid strategy (combines LFU and time-awareness)
   */
  private findHybridKey(): string {
    let targetKey = "";
    let highestScore = -1;
    const now = Date.now();

    for (const [key, entry] of this.cache) {
      // Hybrid score: frequency weight + time weight + size weight
      const frequencyScore = 1 / (entry.frequency + 1); // Lower frequency = higher score
      const timeScore = (now - entry.lastAccess) / (24 * 60 * 60 * 1000); // Days since access
      const sizeScore = entry.size / (1024 * 1024); // Size in MB

      // Weighted combination
      const hybridScore =
        frequencyScore * 0.4 + timeScore * 0.4 + sizeScore * 0.2;

      if (hybridScore > highestScore) {
        highestScore = hybridScore;
        targetKey = key;
      }
    }

    return targetKey;
  }

  /**
   * Estimate size of cached value in bytes
   */
  private estimateSize(value: any): number {
    try {
      // If it's already a string (potentially compressed), use its length
      if (typeof value === "string") {
        return value.length * 2; // UTF-16 estimate
      }

      // For objects, stringify and estimate
      const jsonString = JSON.stringify(value);
      return jsonString.length * 2; // Rough estimate (UTF-16)
    } catch {
      return 1024; // Default 1KB if can't estimate
    }
  }

  /**
   * Update cache statistics
   */
  private updateStats(): void {
    this.stats.entryCount = this.cache.size;
    this.stats.totalSize = Array.from(this.cache.values()).reduce(
      (sum, entry) => sum + entry.size,
      0
    );

    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate =
      total === 0 ? "0%" : `${Math.round((this.stats.hits / total) * 100)}%`;

    this.stats.avgFrequency =
      this.cache.size === 0
        ? 0
        : Array.from(this.cache.values()).reduce(
            (sum, entry) => sum + entry.frequency,
            0
          ) / this.cache.size;

    this.stats.memoryUsage = `${(this.stats.totalSize / (1024 * 1024)).toFixed(
      2
    )} MB`;
  }

  /**
   * Perform periodic maintenance
   */
  private performMaintenance(): void {
    const now = Date.now();
    let expiredCount = 0;

    // Remove expired entries
    for (const [key, entry] of this.cache) {
      if (entry.expiry < now) {
        this.cache.delete(key);
        expiredCount++;
      }
    }

    if (expiredCount > 0) {
      this.updateStats();
      logger.debug(
        `Cache maintenance: removed ${expiredCount} expired entries`
      );
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    this.updateStats();
    return { ...this.stats };
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      totalSize: 0,
      entryCount: 0,
      hitRate: "0%",
      avgFrequency: 0,
      memoryUsage: "0 MB",
    };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.clear();
  }
}

// Export eviction policies for external use
export { EvictionPolicy };
