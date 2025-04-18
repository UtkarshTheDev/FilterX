import express from "express";
import type { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { config } from "./config";
import logger from "./utils/logger";

// Route imports
import filterRoutes from "./routes/filter";
import adminRoutes from "./routes/admin";
import apiKeyRoutes from "./routes/apiKey";

// Middleware imports
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

// Controller imports
import { statsController } from "./controllers/statsController";

// Initialize express app
const app: Express = express();

// Custom request logger middleware
const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const { method, path, ip } = req;

  // Log request info
  logger.debug(`${method} ${path} - Request received from ${ip}`);

  // Log response when finished
  res.on("finish", () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;

    // Log with different levels based on status code
    if (statusCode >= 500) {
      logger.error(`${method} ${path} - ${statusCode} - ${duration}ms`);
    } else if (statusCode >= 400) {
      logger.warn(`${method} ${path} - ${statusCode} - ${duration}ms`);
    } else {
      logger.info(`${method} ${path} - ${statusCode} - ${duration}ms`);
    }
  });

  next();
};

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: config.corsOrigins,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Request parsing
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Use custom request logger
app.use(requestLogger);

// Global rate limiter
const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});
app.use(globalLimiter);

// API routes
app.use("/v1/filter", filterRoutes);
app.use("/admin/stats", adminRoutes);
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
