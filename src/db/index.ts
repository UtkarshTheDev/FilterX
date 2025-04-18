import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { config } from "../config";

// Create a PostgreSQL connection pool
const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  ssl: config.db.ssl ? { rejectUnauthorized: false } : false,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
});

// Test database connection on startup
pool
  .connect()
  .then((client) => {
    console.log("Database connection established successfully");
    client.release();
  })
  .catch((err) => {
    console.error("Error connecting to database:", err);
  });

// Create Drizzle instance
export const db = drizzle(pool);

// Export pool for direct access when needed
export { pool };
