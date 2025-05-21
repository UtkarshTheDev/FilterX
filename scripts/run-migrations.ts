#!/usr/bin/env bun
import { createStatsTables, dropStatsTables } from "../src/db/migrations/20231015_create_stats_tables";
import { logger } from "../src/utils/logger";

/**
 * Simple migration runner script
 * Applies or rolls back database migrations based on command line arguments
 */
async function runMigrations() {
  const args = process.argv.slice(2);
  const action = args[0] || "up";

  try {
    logger.info(`Running migrations: ${action}`);

    if (action === "up") {
      // Run migrations in order
      await createStatsTables();
      logger.info("All migrations completed successfully");
    } else if (action === "down") {
      // Run rollbacks in reverse order
      await dropStatsTables();
      logger.info("All rollbacks completed successfully");
    } else {
      logger.error(`Unknown action: ${action}. Use 'up' or 'down'.`);
      process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    logger.error("Migration failed:", error);
    process.exit(1);
  }
}

// Run the migrations
runMigrations();
