import { gzipSync, gunzipSync } from "zlib";
import logger from "./logger";

// Compression threshold - only compress responses larger than this
const COMPRESSION_THRESHOLD = 1024; // 1KB

// Compression marker to identify compressed data
const COMPRESSION_MARKER = "GZIP:";

/**
 * Compress data if it's large enough to benefit from compression
 * @param data Data to potentially compress
 * @returns Compressed data or original data if compression not beneficial
 */
export const compressIfBeneficial = (data: any): string => {
  try {
    const jsonString = JSON.stringify(data);
    
    // Only compress if data is large enough
    if (jsonString.length < COMPRESSION_THRESHOLD) {
      return jsonString;
    }

    // Compress the data
    const compressed = gzipSync(jsonString);
    
    // Only use compression if it actually reduces size significantly (>20% reduction)
    if (compressed.length < jsonString.length * 0.8) {
      const base64Compressed = compressed.toString("base64");
      logger.debug(
        `Cache compression: ${jsonString.length} bytes -> ${base64Compressed.length} bytes ` +
        `(${Math.round((1 - base64Compressed.length / jsonString.length) * 100)}% reduction)`
      );
      return COMPRESSION_MARKER + base64Compressed;
    }

    // Compression not beneficial, return original
    return jsonString;
  } catch (error) {
    logger.error("Error compressing cache data:", error);
    // Fallback to uncompressed JSON
    return JSON.stringify(data);
  }
};

/**
 * Decompress data if it was compressed
 * @param data Potentially compressed data
 * @returns Decompressed data
 */
export const decompressIfNeeded = (data: string): any => {
  try {
    // Check if data is compressed
    if (data.startsWith(COMPRESSION_MARKER)) {
      const base64Data = data.substring(COMPRESSION_MARKER.length);
      const compressed = Buffer.from(base64Data, "base64");
      const decompressed = gunzipSync(compressed);
      const jsonString = decompressed.toString();
      
      logger.debug(
        `Cache decompression: ${data.length} bytes -> ${jsonString.length} bytes`
      );
      
      return JSON.parse(jsonString);
    }

    // Data is not compressed, parse normally
    return JSON.parse(data);
  } catch (error) {
    logger.error("Error decompressing cache data:", error);
    // Try to parse as regular JSON as fallback
    try {
      return JSON.parse(data);
    } catch (parseError) {
      logger.error("Error parsing cache data as JSON:", parseError);
      return null;
    }
  }
};

/**
 * Estimate the memory savings from compression
 * @param originalSize Original data size in bytes
 * @param compressedSize Compressed data size in bytes
 * @returns Compression statistics
 */
export const getCompressionStats = (originalSize: number, compressedSize: number) => {
  const savings = originalSize - compressedSize;
  const ratio = originalSize > 0 ? (savings / originalSize) * 100 : 0;
  
  return {
    originalSize,
    compressedSize,
    savings,
    ratio: Math.round(ratio * 100) / 100, // Round to 2 decimal places
    worthwhile: ratio > 20 // Only worthwhile if >20% reduction
  };
};

/**
 * Smart compression that adapts based on data type and size
 * @param data Data to compress
 * @param forceCompress Force compression even if not beneficial
 * @returns Compressed data with metadata
 */
export const smartCompress = (data: any, forceCompress: boolean = false): {
  data: string;
  compressed: boolean;
  originalSize: number;
  finalSize: number;
} => {
  const jsonString = JSON.stringify(data);
  const originalSize = jsonString.length;

  // Skip compression for small data unless forced
  if (!forceCompress && originalSize < COMPRESSION_THRESHOLD) {
    return {
      data: jsonString,
      compressed: false,
      originalSize,
      finalSize: originalSize
    };
  }

  try {
    const compressed = gzipSync(jsonString);
    const base64Compressed = compressed.toString("base64");
    const compressedData = COMPRESSION_MARKER + base64Compressed;
    
    // Use compression if beneficial or forced
    if (forceCompress || compressedData.length < originalSize * 0.8) {
      return {
        data: compressedData,
        compressed: true,
        originalSize,
        finalSize: compressedData.length
      };
    }
  } catch (error) {
    logger.error("Error in smart compression:", error);
  }

  // Return uncompressed data
  return {
    data: jsonString,
    compressed: false,
    originalSize,
    finalSize: originalSize
  };
};

/**
 * Batch compression for multiple cache entries
 * @param entries Array of cache entries to compress
 * @returns Compressed entries with statistics
 */
export const batchCompress = (entries: Array<{ key: string; data: any }>) => {
  const results = [];
  let totalOriginalSize = 0;
  let totalCompressedSize = 0;
  let compressedCount = 0;

  for (const entry of entries) {
    const result = smartCompress(entry.data);
    results.push({
      key: entry.key,
      ...result
    });

    totalOriginalSize += result.originalSize;
    totalCompressedSize += result.finalSize;
    if (result.compressed) compressedCount++;
  }

  const overallSavings = totalOriginalSize - totalCompressedSize;
  const overallRatio = totalOriginalSize > 0 ? 
    (overallSavings / totalOriginalSize) * 100 : 0;

  return {
    entries: results,
    statistics: {
      totalEntries: entries.length,
      compressedEntries: compressedCount,
      totalOriginalSize,
      totalCompressedSize,
      totalSavings: overallSavings,
      compressionRatio: Math.round(overallRatio * 100) / 100
    }
  };
};

/**
 * Check if data appears to be compressed
 * @param data Data to check
 * @returns True if data appears to be compressed
 */
export const isCompressed = (data: string): boolean => {
  return data.startsWith(COMPRESSION_MARKER);
};

/**
 * Get compression ratio for a piece of data
 * @param data Potentially compressed data
 * @returns Compression ratio or null if not compressed
 */
export const getCompressionRatio = (data: string): number | null => {
  if (!isCompressed(data)) {
    return null;
  }

  try {
    const decompressed = decompressIfNeeded(data);
    const originalSize = JSON.stringify(decompressed).length;
    const compressedSize = data.length;
    
    return originalSize > 0 ? ((originalSize - compressedSize) / originalSize) * 100 : 0;
  } catch (error) {
    logger.error("Error calculating compression ratio:", error);
    return null;
  }
};
