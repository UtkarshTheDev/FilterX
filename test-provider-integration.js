#!/usr/bin/env node

/**
 * Test script for the new provider-agnostic AI model selection system
 * This script tests the integration of Gemini API with the existing Akash Chat system
 *
 * Usage: node test-provider-integration.js
 * Make sure GEMINI_API_KEY and AKASH_CHAT_API_KEY are set in your environment
 */

import axios from "axios";

// Configuration
const BASE_URL = "http://localhost:8000";
const API_KEY = process.env.DEV_API_KEY || "test-api-key";

// Test cases for different providers and models
const testCases = [
  {
    name: "Akash Pro Model - Complex Content",
    data: {
      text: "You can reach me at five five five one two three four five six seven for urgent matters.",
      model: "pro",
      config: {
        allowAbuse: false,
        allowEmail: false,
        allowPhone: false,
        returnFilteredMessage: true,
      },
    },
    expectedBehavior:
      "Should detect spelled-out phone number using Akash Pro model",
  },
  {
    name: "Gemini Fast Model - Email Detection",
    data: {
      text: "Contact me at user [at] example [dot] com for more information.",
      model: "fast",
      config: {
        allowAbuse: false,
        allowEmail: false,
        allowPhone: true,
        returnFilteredMessage: true,
      },
    },
    expectedBehavior:
      "Should detect obfuscated email using Gemini Fast model (gemini-2.5-flash-preview-05-20)",
  },
  {
    name: "Akash Normal Model - Clean Content",
    data: {
      text: "Hello, how are you doing today? I hope you're having a great day!",
      model: "normal",
      config: {
        allowAbuse: false,
        allowEmail: false,
        allowPhone: false,
        returnFilteredMessage: false,
      },
    },
    expectedBehavior: "Should pass clean content using Akash Normal model",
  },
  {
    name: "Provider Flexibility Test - Mixed Content",
    data: {
      text: "My Instagram is @cooluser and you can call me at 555-123-4567",
      model: "fast",
      config: {
        allowAbuse: false,
        allowEmail: false,
        allowPhone: true, // Allow phone but not social
        allowSocialInformation: false,
        returnFilteredMessage: true,
      },
    },
    expectedBehavior: "Should block social media but allow phone number",
  },
];

// Test individual request
async function testCase(testCaseData) {
  const { name, data, expectedBehavior } = testCaseData;

  console.log(`\n🧪 Testing: ${name}`);
  console.log(`📝 Expected: ${expectedBehavior}`);
  console.log(`📊 Model Tier: ${data.model}`);
  console.log(`🔧 Config: ${JSON.stringify(data.config)}`);

  const startTime = Date.now();

  try {
    const response = await axios.post(`${BASE_URL}/v1/filter`, data, {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      timeout: 15000, // 15 second timeout
    });

    const duration = Date.now() - startTime;
    const result = response.data;

    console.log(`✅ Status: ${response.status}`);
    console.log(`⏱️  Duration: ${duration}ms`);
    console.log(`🚫 Blocked: ${result.blocked}`);
    console.log(`🏷️  Flags: [${result.flags.join(", ")}]`);
    console.log(`💬 Reason: ${result.reason}`);

    if (result.filteredMessage) {
      console.log(`🔧 Filtered: "${result.filteredMessage}"`);
    }

    // Check response headers for provider information
    const processingTime = response.headers["x-processing-time"];
    if (processingTime) {
      console.log(`⚡ Server Processing: ${processingTime}`);
    }

    return { success: true, duration, result };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.log(`❌ Error: ${error.message}`);
    console.log(`⏱️  Duration: ${duration}ms`);

    if (error.response) {
      console.log(`📊 Status: ${error.response.status}`);
      console.log(
        `📝 Response: ${JSON.stringify(error.response.data, null, 2)}`
      );
    }

    return { success: false, duration, error: error.message };
  }
}

// Test batch request with mixed providers
async function testBatchRequest() {
  console.log(`\n🔄 Testing Batch Request with Mixed Providers`);

  const batchData = {
    items: [
      {
        text: "Call me at 555-123-4567",
        model: "pro", // Should use Akash
        config: { allowPhone: false, returnFilteredMessage: true },
      },
      {
        text: "Email me at user@example.com",
        model: "fast", // Should use Gemini
        config: { allowEmail: false, returnFilteredMessage: true },
      },
      {
        text: "This is perfectly clean content",
        model: "normal", // Should use Akash
        config: { allowAbuse: false },
      },
    ],
  };

  const startTime = Date.now();

  try {
    const response = await axios.post(
      `${BASE_URL}/v1/filter/batch`,
      batchData,
      {
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": API_KEY,
        },
        timeout: 30000, // 30 second timeout for batch
      }
    );

    const duration = Date.now() - startTime;
    const results = response.data.results;

    console.log(`✅ Status: ${response.status}`);
    console.log(`⏱️  Total Duration: ${duration}ms`);
    console.log(`📊 Results Count: ${results.length}`);

    results.forEach((result, index) => {
      console.log(`\n  Item ${index + 1}:`);
      console.log(`    🚫 Blocked: ${result.blocked}`);
      console.log(`    🏷️  Flags: [${result.flags.join(", ")}]`);
      console.log(`    💬 Reason: ${result.reason}`);
      if (result.filteredMessage) {
        console.log(`    🔧 Filtered: "${result.filteredMessage}"`);
      }
    });

    return { success: true, duration, results };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.log(`❌ Error: ${error.message}`);
    console.log(`⏱️  Duration: ${duration}ms`);

    if (error.response) {
      console.log(`📊 Status: ${error.response.status}`);
      console.log(
        `📝 Response: ${JSON.stringify(error.response.data, null, 2)}`
      );
    }

    return { success: false, duration, error: error.message };
  }
}

// Check server health
async function checkServer() {
  try {
    console.log("🔍 Checking server health...");
    const response = await axios.get(`${BASE_URL}/health`, { timeout: 5000 });
    console.log("✅ Server is running");
    return true;
  } catch (error) {
    console.log("❌ Server is not running or not accessible");
    console.log("💡 Make sure to start the server first:");
    console.log("   npm run dev");
    return false;
  }
}

// Main test function
async function runTests() {
  console.log("🚀 Starting Provider Integration Tests");
  console.log("🔗 Base URL:", BASE_URL);
  console.log("🔑 Using API Key:", API_KEY.substring(0, 8) + "...");
  console.log("📝 Testing provider-agnostic model selection");
  console.log("");

  const results = [];

  // Test individual requests
  for (const testCaseData of testCases) {
    const result = await testCase(testCaseData);
    results.push(result);
    await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds between tests
  }

  // Test batch request
  const batchResult = await testBatchRequest();
  results.push(batchResult);

  // Summary
  console.log("\n📊 Test Summary");
  console.log("================");
  const successful = results.filter((r) => r.success).length;
  const total = results.length;
  console.log(`✅ Successful: ${successful}/${total}`);
  console.log(`❌ Failed: ${total - successful}/${total}`);

  const avgDuration =
    results.reduce((sum, r) => sum + r.duration, 0) / results.length;
  console.log(`⏱️  Average Duration: ${Math.round(avgDuration)}ms`);

  if (successful === total) {
    console.log(
      "\n🎉 All tests passed! Provider integration is working correctly."
    );
  } else {
    console.log("\n⚠️  Some tests failed. Check the logs above for details.");
  }
}

// Run the tests
async function main() {
  console.log("🧪 Provider Integration Testing Script");
  console.log("=====================================");
  console.log("🔑 Environment Check:");
  console.log(
    "  GEMINI_API_KEY:",
    process.env.GEMINI_API_KEY ? "✅ Set" : "❌ Not set"
  );
  console.log(
    "  AKASH_CHAT_API_KEY:",
    process.env.AKASH_CHAT_API_KEY ? "✅ Set" : "❌ Not set"
  );
  console.log(
    "  DEV_API_KEY:",
    process.env.DEV_API_KEY ? "✅ Set" : "⚠️  Using default"
  );
  console.log("");

  const serverRunning = await checkServer();
  if (serverRunning) {
    await runTests();
  } else {
    console.log("\n💡 To start the server, run: npm run dev");
    console.log("💡 Make sure your .env file has the required API keys");
  }
}

main().catch(console.error);
