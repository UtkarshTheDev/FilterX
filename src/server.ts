import app from "./app";
import { config } from "./config";
import logger from "./utils/logger";
import {
  isRedisHealthy,
  closeRedisConnection,
  getRedisClient,
} from "./utils/redis";
import { isDatabaseHealthy, pool } from "./db";

const PORT = config.port || 3000;

/**
 * Initialize core services
 */
const initializeServices = async () => {
  // Force-initialize Redis client
  try {
    getRedisClient();
    logger.debug("Redis client initialized");
  } catch (error) {
    logger.error("Failed to initialize Redis client", error);
  }

  // Additional service initialization can be added here
};

/**
 * Check service health during startup
 */
const checkServicesHealth = async () => {
  // Check Redis health
  const redisHealthy = await isRedisHealthy();
  if (redisHealthy) {
    logger.info("Redis connection is healthy");
  } else {
    logger.warn(
      "Redis connection is not healthy - some features may be impacted"
    );
  }

  // Check database health
  const dbHealthy = await isDatabaseHealthy();
  if (dbHealthy) {
    logger.info("Database connection is healthy");
  } else {
    logger.warn(
      "Database connection is not healthy - some features may be impacted"
    );
  }
};

/**
 * Gracefully shutdown the server and resources
 */
const shutdown = async (signal: string) => {
  logger.info(`${signal} signal received: shutting down...`);

  try {
    // Close Redis connection
    await closeRedisConnection();

    // Close database connection pool
    await pool.end();
    logger.info("Database connections closed");

    logger.info("All connections closed successfully");
    process.exit(0);
  } catch (error) {
    logger.error("Error during graceful shutdown", error);
    process.exit(1);
  }
};

/**
 * Start the server and log initialization info
 */
const startServer = async () => {
  try {
    // Display startup header
    logger.startupHeader();

    // Initialize services before starting server
    await initializeServices();

    // Start server
    const server = app.listen(PORT, () => {
      logger.info(`Server is running on port ${PORT}`);

      // Check services after server starts
      setTimeout(checkServicesHealth, 1000);
    });

    // Handle graceful shutdown
    process.on("SIGTERM", async () => {
      logger.info("SIGTERM signal received: closing HTTP server");
      server.close(async () => {
        logger.info("HTTP server closed");
        await shutdown("SIGTERM");
      });
    });

    process.on("SIGINT", async () => {
      logger.info("SIGINT signal received: closing HTTP server");
      server.close(async () => {
        logger.info("HTTP server closed");
        await shutdown("SIGINT");
      });
    });

    // Handle uncaught exceptions
    process.on("uncaughtException", (error) => {
      logger.error("Uncaught exception", error);
      server.close(async () => {
        await shutdown("UNCAUGHT_EXCEPTION");
      });
    });

    // Handle unhandled promise rejections
    process.on("unhandledRejection", (reason) => {
      logger.error("Unhandled promise rejection", reason);
      server.close(async () => {
        await shutdown("UNHANDLED_REJECTION");
      });
    });

    return server;
  } catch (error) {
    logger.error("Failed to start server", error);
    process.exit(1);
  }
};

// Start the server
const server = startServer();

export default server;
