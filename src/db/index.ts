import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
const { Pool } = pkg;
import { config } from "../config";
import logger from "../utils/logger";

// Singleton database pool instance
let poolInstance: Pool | null = null;
let dbInstance: any | null = null;
let isWarmedUp = false;

/**
 * Get a singleton database pool instance with optimized connection settings
 */
export const getPool = (): Pool => {
  if (poolInstance) {
    return poolInstance;
  }

  logger.info(
    "Initializing PostgreSQL connection pool with optimized settings"
  );

  // Create a PostgreSQL connection pool with optimized settings
  poolInstance = new Pool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    ssl: config.db.ssl ? { rejectUnauthorized: false } : false,

    // Connection pool optimization
    max: 10, // Maximum number of clients in the pool

    // Timeout optimizations
    idleTimeoutMillis: 300000, // Keep idle connections for 5 minutes (rather than closing them quickly)
    connectionTimeoutMillis: 3000, // Return an error faster if a connection can't be established

    // Connection handling
    allowExitOnIdle: false, // Prevent the app from exiting when the pool is idle
  });

  // Enhanced error handling and logging for the connection pool
  poolInstance.on("connect", () => {
    logger.debug("New database connection established");
  });

  poolInstance.on("error", (err) => {
    logger.error("Unexpected database pool error", err);
  });

  poolInstance.on("acquire", () => {
    logger.debug("Client acquired from pool");
  });

  poolInstance.on("remove", () => {
    logger.debug("Client removed from pool");
  });

  // Warm up the connection pool immediately to prevent cold starts
  warmupConnectionPool();

  return poolInstance;
};

/**
 * Warm up the connection pool by creating multiple connections in advance
 * This prevents the delay for the first request
 */
export const warmupConnectionPool = async (): Promise<void> => {
  if (isWarmedUp || !poolInstance) return;

  logger.info("Warming up database connection pool");

  try {
    // Create and test multiple connections in parallel
    const warmupPromises = [];
    const minConnections = 2; // Create at least this many connections

    for (let i = 0; i < minConnections; i++) {
      warmupPromises.push(
        (async () => {
          const client = await poolInstance!.connect();
          await client.query("SELECT 1 as warmup");
          client.release();
          logger.debug(`Connection ${i + 1} successfully warmed up`);
        })()
      );
    }

    await Promise.all(warmupPromises);
    isWarmedUp = true;
    logger.info(
      `Database connection pool successfully warmed up with ${minConnections} connections`
    );
  } catch (error) {
    logger.error("Error warming up connection pool", error);
  }
};

/**
 * Get a singleton Drizzle ORM instance
 */
export const getDb = () => {
  if (!dbInstance) {
    const pool = getPool();
    dbInstance = drizzle(pool);
  }
  return dbInstance;
};

// Initialize instances
const pool = getPool();
const db = getDb();

// Periodically ping the database to keep connections alive
setInterval(async () => {
  try {
    const client = await pool.connect();
    await client.query("SELECT 1 as keep_alive");
    client.release();
    logger.debug("DB keep-alive ping successful");
  } catch (error) {
    logger.error("DB keep-alive ping failed", error);
    // Attempt to re-warm the pool if the ping failed
    isWarmedUp = false;
    warmupConnectionPool();
  }
}, 60000); // Every minute

// Check database health with improved error handling
export const isDatabaseHealthy = async (): Promise<boolean> => {
  try {
    // Use a shorter timeout for health checks
    const client = await pool.connect();
    // Use standard query method instead of timeout option which isn't supported
    const result = await client.query("SELECT 1 as health_check");
    client.release();
    return result.rows.length > 0 && result.rows[0].health_check === 1;
  } catch (error) {
    logger.error("Database health check failed", error);
    // Attempt to re-warm the pool after a health check failure
    isWarmedUp = false;
    warmupConnectionPool();
    return false;
  }
};

// Export pool and db for direct access when needed
export { pool, db };
