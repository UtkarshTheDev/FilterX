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
  };
  akashChat: {
    apiKey: string;
    baseUrl: string;
    model: string;
  };
  moonDream: {
    apiKey: string;
    baseUrl: string;
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
  };
}

// Parse and export config with defaults
export const config: Config = {
  port: parseInt(process.env.PORT || "3000", 10),
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
  },
  akashChat: {
    apiKey: process.env.AKASH_CHAT_API_KEY || "",
    baseUrl:
      process.env.AKASH_CHAT_BASE_URL || "https://chatapi.akash.network/api/v1",
    model: process.env.AKASH_CHAT_MODEL || "Meta-Llama-3-1-8B-Instruct-FP8",
  },
  moonDream: {
    apiKey: process.env.MOONDREAM_API_KEY || "",
    baseUrl: process.env.MOONDREAM_BASE_URL || "https://api.moondream.ai/v1",
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
    responseTTL: parseInt(process.env.CACHE_RESPONSE_TTL || "3600", 10), // 1 hour
  },
};
