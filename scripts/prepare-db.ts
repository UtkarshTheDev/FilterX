#!/usr/bin/env bun
import { db, pool } from "../src/db";
import { apiKeys } from "../src/models/schema";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import bcrypt from "bcrypt";

/**
 * Database preparation script for FilterX
 * This script creates initial test data and API keys
 */
const main = async () => {
  console.log("Preparing database with initial data...");

  try {
    // Create a test API key if none exists
    const existingKeys = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.ip, "127.0.0.1"));

    if (existingKeys.length === 0) {
      console.log("Creating test API key...");

      // Generate API key and userId
      const key = randomBytes(32).toString("hex");
      const userId = `user_${bcrypt
        .hashSync("127.0.0.1", 10)
        .replace(/[/$.]/g, "")
        .slice(0, 32)}`;

      // Insert test API key
      await db.insert(apiKeys).values({
        key,
        ip: "127.0.0.1",
        userId,
        createdAt: new Date(),
        lastUsedAt: new Date(),
        isActive: true,
      });

      console.log("Test API key created successfully!");
      console.log(`API Key: ${key}`);
      console.log(`User ID: ${userId}`);
    } else {
      console.log("Test API key already exists:", existingKeys[0].key);
    }

    console.log("Database preparation completed successfully!");
  } catch (error) {
    console.error("Database preparation error:", error);
    process.exit(1);
  } finally {
    // Close database connection
    await pool.end();
  }
};

// Run the preparation
main();
