import express from "express";
import type { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { config } from "./config";
import logger from "./utils/logger";

// Route imports
import filterRoutes from "./routes/filter";
import statsRoutes from "./routes/statsRoutes";
import apiKeyRoutes from "./routes/apiKey";

// Middleware imports
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

// Controller imports
import { statsController } from "./controllers/statsController";

// Initialize express app
const app: Express = express();

// Custom request logger middleware - optimized for reduced verbosity
const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const { method, path } = req;

  // Log response when finished
  res.on("finish", () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;

    // Only log errors, warnings, and slow requests to reduce noise
    if (statusCode >= 500) {
      logger.error(`${method} ${path} - ${statusCode} - ${duration}ms`);
    } else if (statusCode >= 400) {
      logger.warn(`${method} ${path} - ${statusCode} - ${duration}ms`);
    } else if (duration > 500) {
      // Only log slow successful requests (>500ms)
      logger.perf(`${method} ${path} - ${statusCode} - ${duration}ms (slow)`);
    }
    // Remove routine success logging to reduce noise
  });

  next();
};

// Security middleware
app.use(
  helmet({
    // Disable CSP for API service since we don't serve HTML
    contentSecurityPolicy: false,
    // Enable other security headers
    xssFilter: true,
    noSniff: true,
    referrerPolicy: { policy: "no-referrer" },
  })
);

app.use(
  cors({
    origin: config.corsOrigins,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
    // Add performance optimization headers for browsers
    exposedHeaders: [
      "X-RateLimit-Limit",
      "X-RateLimit-Remaining",
      "X-Processing-Time",
    ],
    maxAge: 600, // Cache preflight requests for 10 minutes
  })
);

// Request parsing - optimize for speed
app.use(
  express.json({
    limit: "10mb",
    // Disable unnecessary reviver function and strict mode for faster parsing
    strict: false,
  })
);

// Only parse URL encoded data for routes that need it
app.use(
  express.urlencoded({
    extended: true,
    limit: "10mb",
  })
);

// Use custom request logger
app.use(requestLogger);

// Global rate limiter
const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
  // Skip expensive DB operations
  skipFailedRequests: true,
  // We just use the default memory store which is fast enough
  // Redis is not needed for the global rate limiter
});
app.use(globalLimiter);

// API routes
app.use("/v1/filter", filterRoutes);
app.use("/stats", statsRoutes);
app.use("/v1/apikey", apiKeyRoutes);

// Health check route
app.get("/health", statsController.getHealthStatus);

// Route not found handler (404)
app.use(notFoundHandler);

// Error handling
app.use(errorHandler);

// Log app initialization
logger.debug("Express application initialized");

export default app;
