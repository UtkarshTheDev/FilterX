import express from "express";
import type { Express } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { config } from "./config";

// Route imports
import filterRoutes from "./routes/filter";
import adminRoutes from "./routes/admin";
import apiKeyRoutes from "./routes/apiKey";

// Middleware imports
import { errorHandler } from "./middleware/errorHandler";

const app: Express = express();

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

// Logging
app.use(morgan("combined"));

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
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// Error handling
app.use(errorHandler);

export default app;
