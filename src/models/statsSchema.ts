import {
  pgTable,
  serial,
  date,
  integer,
  varchar,
  timestamp,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";

/**
 * Daily request statistics table
 * Stores aggregated request metrics per day
 */
export const requestStatsDaily = pgTable(
  "request_stats_daily",
  {
    date: date("date").primaryKey(),
    totalRequests: integer("total_requests").notNull().default(0),
    filteredRequests: integer("filtered_requests").notNull().default(0),
    blockedRequests: integer("blocked_requests").notNull().default(0),
    cachedRequests: integer("cached_requests").notNull().default(0),
    avgResponseTimeMs: integer("avg_response_time_ms").notNull().default(0),
    p95ResponseTimeMs: integer("p95_response_time_ms").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  }
);

/**
 * Hourly API performance metrics table
 * Stores detailed API performance data per hour
 */
export const apiPerformanceHourly = pgTable(
  "api_performance_hourly",
  {
    id: serial("id").primaryKey(),
    timestamp: timestamp("timestamp").notNull(),
    apiType: varchar("api_type", { length: 20 }).notNull(),
    totalCalls: integer("total_calls").notNull().default(0),
    errorCalls: integer("error_calls").notNull().default(0),
    cacheHits: integer("cache_hits").notNull().default(0),
    cacheMisses: integer("cache_misses").notNull().default(0),
    avgResponseTimeMs: integer("avg_response_time_ms").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => {
    return {
      timestampIdx: uniqueIndex("idx_api_perf_timestamp").on(table.timestamp),
      typeIdx: uniqueIndex("idx_api_perf_type").on(table.apiType),
      uniqueTimestampType: uniqueIndex("unique_timestamp_type").on(
        table.timestamp,
        table.apiType
      ),
    };
  }
);

/**
 * Daily content flag statistics table
 * Tracks occurrence of different content flags per day
 */
export const contentFlagsDaily = pgTable(
  "content_flags_daily",
  {
    id: serial("id").primaryKey(),
    date: date("date").notNull(),
    flagName: varchar("flag_name", { length: 50 }).notNull(),
    count: integer("count").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => {
    return {
      dateIdx: uniqueIndex("idx_flags_date").on(table.date),
      uniqueDateFlag: uniqueIndex("unique_date_flag").on(
        table.date,
        table.flagName
      ),
    };
  }
);

/**
 * Daily user activity statistics table
 * Tracks per-user activity metrics (for high-value users only)
 */
export const userActivityDaily = pgTable(
  "user_activity_daily",
  {
    id: serial("id").primaryKey(),
    date: date("date").notNull(),
    userId: varchar("user_id", { length: 64 }).notNull(),
    requestCount: integer("request_count").notNull().default(0),
    blockedCount: integer("blocked_count").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => {
    return {
      dateIdx: uniqueIndex("idx_user_activity_date").on(table.date),
      userIdx: uniqueIndex("idx_user_activity_user").on(table.userId),
      uniqueDateUser: uniqueIndex("unique_date_user").on(
        table.date,
        table.userId
      ),
    };
  }
);

// Type definitions for the tables
export type RequestStatsDaily = typeof requestStatsDaily.$inferSelect;
export type NewRequestStatsDaily = typeof requestStatsDaily.$inferInsert;

export type ApiPerformanceHourly = typeof apiPerformanceHourly.$inferSelect;
export type NewApiPerformanceHourly = typeof apiPerformanceHourly.$inferInsert;

export type ContentFlagsDaily = typeof contentFlagsDaily.$inferSelect;
export type NewContentFlagsDaily = typeof contentFlagsDaily.$inferInsert;

export type UserActivityDaily = typeof userActivityDaily.$inferSelect;
export type NewUserActivityDaily = typeof userActivityDaily.$inferInsert;
