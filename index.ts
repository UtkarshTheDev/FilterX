#!/usr/bin/env bun
/**
 * FilterX - Main Entry Point
 *
 * This file imports and starts the server from src/server.ts
 */

import "./src/server";
import logger from "./src/utils/logger";

// Additional startup info is handled by the logger in server.ts
// This is just a fallback message in case the import above doesn't show logs
setTimeout(() => {
  logger.info(
    "FilterX server is running. Check /health endpoint for detailed status."
  );
}, 1000);
