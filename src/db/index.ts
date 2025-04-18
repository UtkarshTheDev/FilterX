import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { config } from "../config";
import logger from "../utils/logger";

// Singleton database pool instance
let poolInstance: Pool | null = null;
let dbInstance: any | null = null;

/**
 * Get a singleton database pool instance
 */
export const getPool = (): Pool => {
  if (poolInstance) {
    return poolInstance;
  }

  logger.info("Initializing PostgreSQL connection pool");

  // Create a PostgreSQL connection pool
  poolInstance = new Pool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    ssl: config.db.ssl ? { rejectUnauthorized: false } : false,
    max: 10, // Maximum number of clients in the pool (reduced from 20)
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 5000, // Return an error after 5 seconds if connection could not be established
  });

  // Add event listeners for the pool
  poolInstance.on("connect", () => {
    logger.debug("New database connection established");
  });

  poolInstance.on("error", (err) => {
    logger.error("Unexpected database pool error", err);
  });

  // Test database connection on startup - but only once
  poolInstance
    .connect()
    .then((client) => {
      logger.info("Database connection established successfully");
      client.release();
    })
    .catch((err) => {
      logger.error("Error connecting to database", err);
    });

  return poolInstance;
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

// Check database health
export const isDatabaseHealthy = async (): Promise<boolean> => {
  try {
    const client = await pool.connect();
    const result = await client.query("SELECT 1 as health_check");
    client.release();
    return result.rows.length > 0 && result.rows[0].health_check === 1;
  } catch (error) {
    logger.error("Database health check failed", error);
    return false;
  }
};

// Export pool and db for direct access when needed
export { pool, db };
