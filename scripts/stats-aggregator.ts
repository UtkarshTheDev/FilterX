#!/usr/bin/env bun

/**
 * STATS AGGREGATOR SCRIPT
 *
 * This script aggregates stats from Redis to database with comprehensive reporting
 */

import { runStatsAggregation } from "../src/services/statsAggregator";
import { getDatabaseStats } from "../src/services/statsDbFirstService";
import { pool } from "../src/db";
import logger from "../src/utils/logger";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

/**
 * Main aggregation function with comprehensive reporting
 */
async function main() {
  const startTime = Date.now();
  console.log("🚀 Stats Aggregator Starting...\n");

  try {
    // Step 1: Run the stats aggregation
    console.log("📊 Running stats aggregation...");
    const aggregationResult = await runStatsAggregation();

    // Step 2: Display aggregation results
    console.log("\n📋 AGGREGATION RESULTS:");
    console.log(`   ⏱️  Timestamp: ${aggregationResult.timestamp}`);
    console.log(
      `   ✅ Overall Success: ${aggregationResult.success ? "YES" : "NO"}`
    );

    console.log("\n   📈 Individual Task Results:");
    for (const [taskName, success] of Object.entries(
      aggregationResult.results
    )) {
      const icon = success ? "✅" : "❌";
      console.log(
        `      ${icon} ${taskName}: ${success ? "SUCCESS" : "FAILED"}`
      );
    }

    if (aggregationResult.errors.length > 0) {
      console.log("\n   ⚠️  Errors Encountered:");
      aggregationResult.errors.forEach((error) => {
        console.log(`      - ${error}`);
      });
    }

    // Step 3: Get current database stats to verify aggregation
    console.log("\n🔍 Verifying aggregation results...");
    try {
      const todayStats = await getDatabaseStats("today");
      const yesterdayStats = await getDatabaseStats("yesterday");

      console.log("\n📊 CURRENT DATABASE STATS:");
      console.log(`   📅 Today (${todayStats.startDate}):`);
      console.log(
        `      Total Requests: ${todayStats.stats.requests.totalRequests}`
      );
      console.log(
        `      Blocked Requests: ${todayStats.stats.requests.blockedRequests}`
      );
      console.log(
        `      Cached Requests: ${todayStats.stats.requests.cachedRequests}`
      );
      console.log(
        `      Cache Hit Rate: ${todayStats.stats.requests.cacheHitRate}%`
      );
      console.log(
        `      Avg Response Time: ${todayStats.stats.requests.avgResponseTime}ms`
      );

      console.log(`\n   📅 Yesterday (${yesterdayStats.startDate}):`);
      console.log(
        `      Total Requests: ${yesterdayStats.stats.requests.totalRequests}`
      );
      console.log(
        `      Blocked Requests: ${yesterdayStats.stats.requests.blockedRequests}`
      );
      console.log(
        `      Cached Requests: ${yesterdayStats.stats.requests.cachedRequests}`
      );

      // API Performance
      console.log("\n   🚀 API Performance (Today):");
      if (todayStats.stats.api.text) {
        console.log(
          `      Text API: ${todayStats.stats.api.text.calls} calls, ${todayStats.stats.api.text.avgResponseTime}ms avg`
        );
      }
      if (todayStats.stats.api.image) {
        console.log(
          `      Image API: ${todayStats.stats.api.image.calls} calls, ${todayStats.stats.api.image.avgResponseTime}ms avg`
        );
      }

      // Content Flags
      console.log("\n   🏷️  Content Flags (Today):");
      console.log(`      Total Flags: ${todayStats.stats.flags.totalFlags}`);
      console.log(
        `      Unique Flag Types: ${todayStats.stats.flags.uniqueFlags}`
      );

      if (todayStats.stats.flags.uniqueFlags > 0) {
        console.log("      Top Flags:");
        const sortedFlags = Object.entries(todayStats.stats.flags.flags)
          .sort(([, a], [, b]) => (b as any).count - (a as any).count)
          .slice(0, 5);

        for (const [flagName, flagData] of sortedFlags) {
          console.log(
            `         ${flagName}: ${(flagData as any).count} occurrences`
          );
        }
      }

      // User Activity
      console.log("\n   👥 User Activity (Today):");
      console.log(`      Active Users: ${todayStats.stats.users.totalUsers}`);
      console.log(
        `      Total User Requests: ${todayStats.stats.users.totalRequests}`
      );
      console.log(
        `      Avg Requests per User: ${todayStats.stats.users.avgRequestsPerUser}`
      );
    } catch (verificationError) {
      console.log(
        `   ⚠️  Could not verify aggregation results: ${verificationError}`
      );
    }

    // Step 4: Performance summary
    const duration = Date.now() - startTime;
    console.log("\n⚡ PERFORMANCE SUMMARY:");
    console.log(`   Duration: ${duration}ms`);
    console.log(
      `   Status: ${aggregationResult.success ? "SUCCESS" : "PARTIAL SUCCESS"}`
    );

    // Step 5: Recommendations
    console.log("\n💡 RECOMMENDATIONS:");
    if (aggregationResult.success) {
      console.log("   ✅ All aggregation tasks completed successfully");
      console.log(
        "   🔄 Consider running this aggregation hourly for best results"
      );
      console.log("   📊 Use the /stats endpoint for better performance");
    } else {
      console.log(
        "   ⚠️  Some aggregation tasks failed - check logs for details"
      );
      console.log("   🔧 Verify Redis and database connections");
      console.log("   🔄 Retry failed tasks or run aggregation again");
    }

    console.log("\n🎯 NEXT STEPS:");
    console.log("   1. Test the stats endpoints:");
    console.log("      GET /stats");
    console.log(
      "      GET /stats/timeseries?startDate=2025-01-01&endDate=2025-01-07"
    );
    console.log(
      "   2. Monitor aggregation performance and adjust frequency as needed"
    );
    console.log("   3. Consider setting up automated aggregation via cron job");

    console.log("\n🏁 Stats Aggregation Completed!");

    // Exit with appropriate code
    process.exit(aggregationResult.success ? 0 : 1);
  } catch (error) {
    console.error("\n💥 Stats Aggregation Failed:");
    console.error(`   Error: ${error}`);
    console.error(`   Duration: ${Date.now() - startTime}ms`);

    console.log("\n🔧 TROUBLESHOOTING:");
    console.log("   1. Check database connection");
    console.log("   2. Verify Redis connection");
    console.log("   3. Check environment variables");
    console.log("   4. Review application logs");

    process.exit(1);
  } finally {
    // Clean up database connections
    try {
      await pool.end();
      console.log("🔌 Database connections closed");
    } catch (error) {
      console.error("Error closing database connections:", error);
    }

    // Force exit to prevent hanging due to keep-alive intervals
    console.log("✨ Stats aggregation script completed");
    process.exit(0);
  }
}

/**
 * Handle script execution
 */
if (require.main === module) {
  // Check for command line arguments
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log("Stats Aggregator");
    console.log("");
    console.log("Usage: bun run scripts/stats-aggregator.ts [options]");
    console.log("");
    console.log("Options:");
    console.log("  --help, -h     Show this help message");
    console.log("  --quiet, -q    Run in quiet mode (less output)");
    console.log("  --verbose, -v  Run in verbose mode (more output)");
    console.log("");
    console.log("Examples:");
    console.log("  bun run scripts/stats-aggregator.ts");
    console.log("  bun run scripts/stats-aggregator.ts --quiet");
    console.log("  bun run scripts/stats-aggregator.ts --verbose");
    process.exit(0);
  }

  // Set logging level based on arguments
  if (args.includes("--quiet") || args.includes("-q")) {
    // Reduce console output for quiet mode
    console.log = () => {}; // Suppress most console.log calls
  } else if (args.includes("--verbose") || args.includes("-v")) {
    // Enable debug logging for verbose mode
    logger.level = "debug";
  }

  // Run the main function
  main().catch((error) => {
    console.error("Unhandled error in stats aggregator:", error);
    process.exit(1);
  });
}

export { main as runStatsAggregator };
