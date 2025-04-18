import {
  pgTable,
  serial,
  varchar,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";

// API keys table schema
export const apiKeys = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 64 }).notNull().unique(),
  ip: varchar("ip", { length: 45 }).notNull().unique(), // IPv6 can be up to 45 chars
  userId: varchar("user_id", { length: 64 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at").defaultNow(),
  isActive: boolean("is_active").default(true).notNull(),
});

// Usage stats table schema for persistent stats (optional/future use)
export const usageStats = pgTable("usage_stats", {
  id: serial("id").primaryKey(),
  apiKeyId: serial("api_key_id").references(() => apiKeys.id),
  date: timestamp("date").defaultNow().notNull(),
  totalRequests: serial("total_requests").default(0).notNull(),
  blockedRequests: serial("blocked_requests").default(0).notNull(),
  cachedRequests: serial("cached_requests").default(0).notNull(),
  flags: varchar("flags", { length: 1000 }).default("{}").notNull(), // JSON string of flag counts
});

// Types
export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;

export type UsageStat = typeof usageStats.$inferSelect;
export type NewUsageStat = typeof usageStats.$inferInsert;
