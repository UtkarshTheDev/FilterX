import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

export interface Config {
  port: number;
  nodeEnv: string;
  corsOrigins: string[];
  db: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    ssl: boolean;
  };
  redis: {
    uri: string;
    connectionTimeout: number;
    maxReconnectAttempts: number;
  };
  akashChat: {
    apiKey: string;
    baseUrl: string;
    model: string;
    timeout: number;
  };
  moonDream: {
    apiKey: string;
    baseUrl: string;
    timeout: number;
  };
  rateLimit: {
    apiKeyRequests: number;
    filterRequests: number;
    windowMs: number;
  };
  caching: {
    defaultTTL: number;
    apiKeyTTL: number;
    responseTTL: number;
    minResponseTTL: number;
    maxResponseTTL: number;
  };
}

// Parse and export config with defaults
export const config: Config = {
  port: parseInt(process.env.PORT || "8000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  corsOrigins: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",")
    : ["*"],
  db: {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432", 10),
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "postgres",
    database: process.env.DB_NAME || "filterx",
    ssl: process.env.DB_SSL === "true",
  },
  redis: {
    uri: process.env.REDIS_URI || "redis://localhost:6379",
    connectionTimeout: parseInt(
      process.env.REDIS_CONNECTION_TIMEOUT || "5000",
      10
    ), // 5 seconds
    maxReconnectAttempts: parseInt(
      process.env.REDIS_MAX_RECONNECT_ATTEMPTS || "3",
      10
    ),
  },
  akashChat: {
    apiKey: process.env.AKASH_CHAT_API_KEY || "",
    baseUrl:
      process.env.AKASH_CHAT_BASE_URL || "https://chatapi.akash.network/api/v1",
    model: process.env.AKASH_CHAT_MODEL || "Meta-Llama-3-1-8B-Instruct-FP8",
    timeout: parseInt(process.env.AKASH_CHAT_TIMEOUT || "5000", 10), // 5 seconds
  },
  moonDream: {
    apiKey: process.env.MOONDREAM_API_KEY || "",
    baseUrl: process.env.MOONDREAM_BASE_URL || "https://api.moondream.ai/v1",
    timeout: parseInt(process.env.MOONDREAM_TIMEOUT || "5000", 10), // 5 seconds
  },
  rateLimit: {
    apiKeyRequests: parseInt(
      process.env.RATE_LIMIT_API_KEY_REQUESTS || "10",
      10
    ), // 10 requests per window
    filterRequests: parseInt(
      process.env.RATE_LIMIT_FILTER_REQUESTS || "30",
      10
    ), // 30 requests per window
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000", 10), // 1 minute
  },
  caching: {
    defaultTTL: parseInt(process.env.CACHE_DEFAULT_TTL || "3600", 10), // 1 hour
    apiKeyTTL: parseInt(process.env.CACHE_API_KEY_TTL || "600", 10), // 10 minutes
    responseTTL: parseInt(process.env.CACHE_RESPONSE_TTL || "86400", 10), // 24 hours (increased from 1 hour)
    minResponseTTL: parseInt(process.env.CACHE_MIN_RESPONSE_TTL || "3600", 10), // Minimum TTL: 1 hour
    maxResponseTTL: parseInt(
      process.env.CACHE_MAX_RESPONSE_TTL || "604800",
      10
    ), // Maximum TTL: 1 week
  },
};
