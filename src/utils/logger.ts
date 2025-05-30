import { config } from "../config";

// ANSI color codes for console output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  underscore: "\x1b[4m",
  blink: "\x1b[5m",
  reverse: "\x1b[7m",
  hidden: "\x1b[8m",

  black: "\x1b[30m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",

  bgBlack: "\x1b[40m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
  bgMagenta: "\x1b[45m",
  bgCyan: "\x1b[46m",
  bgWhite: "\x1b[47m",
};

// Log levels
export const LogLevel = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  PERF: 3,
  DEBUG: 4,
} as const;

export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

// Current log level based on environment
const currentLogLevel =
  config.nodeEnv === "production" ? LogLevel.INFO : LogLevel.DEBUG;

/**
 * Formats a log message with timestamp and optional color
 */
const formatLogMessage = (
  level: string,
  message: string,
  color?: string
): string => {
  const timestamp = new Date().toISOString();
  const appName = "FilterX";

  const formattedLevel = color ? `${color}${level}${colors.reset}` : level;

  return `[${timestamp}] [${appName}] [${formattedLevel}]: ${message}`;
};

/**
 * Central logger utility
 */
export const logger = {
  /**
   * Log error messages
   */
  error: (message: string, error?: any): void => {
    if (currentLogLevel >= LogLevel.ERROR) {
      console.error(formatLogMessage("ERROR", message, colors.red));
      if (error) {
        if (error instanceof Error) {
          console.error(
            `${colors.red}${error.stack || error.message}${colors.reset}`
          );
        } else {
          console.error(
            `${colors.red}Additional error details:${colors.reset}`,
            error
          );
        }
      }
    }
  },

  /**
   * Log warning messages
   */
  warn: (message: string): void => {
    if (currentLogLevel >= LogLevel.WARN) {
      console.warn(formatLogMessage("WARN", message, colors.yellow));
    }
  },

  /**
   * Log informational messages
   */
  info: (message: string): void => {
    if (currentLogLevel >= LogLevel.INFO) {
      console.log(formatLogMessage("INFO", message, colors.green));
    }
  },

  /**
   * Log performance messages (optimized for monitoring)
   */
  perf: (message: string): void => {
    if (currentLogLevel >= LogLevel.PERF) {
      console.log(formatLogMessage("PERF", message, colors.magenta));
    }
  },

  /**
   * Log debug messages (development only by default)
   */
  debug: (message: string, data?: any): void => {
    if (currentLogLevel >= LogLevel.DEBUG) {
      console.log(formatLogMessage("DEBUG", message, colors.cyan));
      if (data) {
        console.log(`${colors.dim}Debug data:${colors.reset}`, data);
      }
    }
  },

  /**
   * Log API performance in structured format
   */
  apiPerf: (
    method: string,
    path: string,
    duration: number,
    status: number,
    extras?: { ai?: boolean; cache?: boolean; blocked?: boolean }
  ): void => {
    if (currentLogLevel >= LogLevel.PERF) {
      const aiFlag = extras?.ai ? "AI:yes" : "AI:no";
      const cacheFlag = extras?.cache ? "Cache:yes" : "Cache:no";
      const blockFlag = extras?.blocked ? "Block:yes" : "Block:no";
      const message = `${method} ${path} ${duration}ms ${aiFlag} ${cacheFlag} ${blockFlag}`;
      console.log(formatLogMessage("PERF", message, colors.magenta));
    }
  },

  /**
   * Log AI service calls
   */
  aiCall: (
    provider: string,
    model: string,
    duration: number,
    decision: string
  ): void => {
    if (currentLogLevel >= LogLevel.INFO) {
      const message = `AI ${provider}/${model} ${duration}ms -> ${decision}`;
      console.log(formatLogMessage("AI", message, colors.blue));
    }
  },

  /**
   * Log content filtering decisions
   */
  filterDecision: (blocked: boolean, reason: string, flags: string[]): void => {
    if (currentLogLevel >= LogLevel.INFO) {
      const status = blocked ? "BLOCKED" : "ALLOWED";
      const flagsStr = flags.length > 0 ? ` [${flags.join(", ")}]` : "";
      const message = `${status}: ${reason}${flagsStr}`;
      console.log(
        formatLogMessage("FILTER", message, blocked ? colors.red : colors.green)
      );
    }
  },

  /**
   * Log startup header with app name and version
   */
  startupHeader: (): void => {
    const version = process.env.bun_package_version || "1.0.0";
    const nodeEnv = config.nodeEnv;
    const port = config.port;

    console.log("\n");
    console.log(
      `${colors.cyan}${colors.bright}===============================================${colors.reset}`
    );
    console.log(
      `${colors.cyan}${colors.bright}    FilterX Content Moderation API v${version}    ${colors.reset}`
    );
    console.log(
      `${colors.cyan}${colors.bright}===============================================${colors.reset}`
    );
    console.log(
      `${colors.green}→ Environment: ${colors.bright}${nodeEnv}${colors.reset}`
    );
    console.log(
      `${colors.green}→ Server running on port: ${colors.bright}${port}${colors.reset}`
    );
    console.log(
      `${colors.green}→ Start time: ${
        colors.bright
      }${new Date().toISOString()}${colors.reset}`
    );
    console.log(
      `${colors.cyan}${colors.bright}===============================================${colors.reset}`
    );
    console.log("\n");
  },
};

export default logger;
