#!/usr/bin/env bun

/**
 * Test script for the tier-based AI model selection system
 * This script tests the new 'model' parameter functionality
 *
 * Usage: bun run test-model-tiers.js
 * Make sure DEV_API_KEY is set in your environment
 */

import axios from "axios";

// Configuration
const BASE_URL = "http://localhost:8000";
const API_KEY = process.env.DEV_API_KEY || "test-api-key";

// Realistic test cases that require AI review - different complexity levels
const testCases = [
  {
    name: "Pro Model - Complex Abuse Detection",
    data: {
      text: "You are such an incompetent fool and I hate dealing with people like you. This is absolutely ridiculous and you should be ashamed of yourself for wasting my time with this garbage.",
      model: "pro",
      config: {
        allowAbuse: false,
        allowEmail: false,
        allowPhone: false,
        returnFilteredMessage: true,
      },
    },
    expectedBehavior:
      "Should detect subtle abusive language and provide filtered version",
  },
  {
    name: "Normal Model - Contact Information Detection",
    data: {
      text: "Hey, I really enjoyed our conversation! You can reach me at john.doe@email.com or call me at (555) 123-4567 if you want to continue this discussion offline.",
      model: "normal",
      config: {
        allowAbuse: true,
        allowEmail: false,
        allowPhone: false,
        returnFilteredMessage: true,
      },
    },
    expectedBehavior:
      "Should detect email and phone number, provide filtered version",
  },
  {
    name: "Fast Model - Social Media Sharing",
    data: {
      text: "Follow me on Instagram @johndoe123 and check out my TikTok videos! Also add me on Discord: JohnGamer#1234. Let's connect on all platforms!",
      model: "fast",
      config: {
        allowAbuse: true,
        allowEmail: true,
        allowPhone: true,
        allowSocialInformation: false,
        returnFilteredMessage: true,
      },
    },
    expectedBehavior: "Should detect social media handles and usernames",
  },
  {
    name: "Pro Model - Sophisticated Threat Detection",
    data: {
      text: "I know where you live and work. Maybe I should pay you a visit sometime soon. You better watch your back because I have friends who can make your life very difficult.",
      model: "pro",
      config: {
        allowAbuse: false,
        allowPhysicalInformation: false,
        returnFilteredMessage: true,
      },
    },
    expectedBehavior: "Should detect implicit threats and intimidation",
  },
  {
    name: "Normal Model - Mixed Content Analysis",
    data: {
      text: "Thanks for the help! BTW, my email is contact.me.here@gmail.com and you can also text me at 555-CALL-NOW. I live at 123 Main Street if you want to meet up. Follow my Twitter @realuser2025",
      model: "normal",
      config: {
        allowAbuse: true,
        allowEmail: false,
        allowPhone: false,
        allowPhysicalInformation: false,
        allowSocialInformation: false,
        returnFilteredMessage: true,
      },
    },
    expectedBehavior: "Should detect multiple types of sensitive information",
  },
  {
    name: "Fast Model - Subtle Harassment",
    data: {
      text: "You're not very bright, are you? I guess some people just aren't cut out for this kind of work. Maybe you should consider a different career path.",
      model: "fast",
      config: {
        allowAbuse: false,
        returnFilteredMessage: true,
      },
    },
    expectedBehavior:
      "Should detect subtle harassment and condescending language",
  },
  {
    name: "Default Model - Obfuscated Contact Info",
    data: {
      text: "Contact me at j o h n dot d o e at g m a i l dot c o m or call five five five one two three four five six seven",
      config: {
        allowEmail: false,
        allowPhone: false,
        returnFilteredMessage: true,
      },
    },
    expectedBehavior:
      "Should detect obfuscated email and spelled-out phone number",
  },
  {
    name: "Pro Model - Complex Contextual Analysis",
    data: {
      text: "I'm really frustrated with this situation. The customer service has been terrible and I feel like I'm being ignored. This is making me very angry and I don't know what to do anymore.",
      model: "pro",
      config: {
        allowAbuse: false,
        returnFilteredMessage: true,
      },
    },
    expectedBehavior:
      "Should distinguish between legitimate frustration and abuse",
  },
];

// Function to test a single case
async function testCase(testCase) {
  console.log(`\n🧪 ${testCase.name}`);
  console.log(
    `💡 Expected: ${testCase.expectedBehavior || "Default behavior"}`
  );
  console.log("📤 Input Text:", `"${testCase.data.text}"`);
  console.log("🔧 Model Tier:", testCase.data.model || "default (normal)");
  console.log("⚙️  Config:", JSON.stringify(testCase.data.config, null, 2));

  const startTime = Date.now();

  try {
    const response = await axios.post(`${BASE_URL}/v1/filter`, testCase.data, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 15000, // Increased timeout for complex AI analysis
    });

    const endTime = Date.now();
    const clientTime = endTime - startTime;

    console.log("✅ Status:", response.status);
    console.log("📥 Response:", JSON.stringify(response.data, null, 2));

    // Performance tracking
    console.log(`⏱️  Client-side Time: ${clientTime}ms`);
    if (response.headers["x-processing-time"]) {
      console.log(
        "⏱️  Server Processing Time:",
        response.headers["x-processing-time"]
      );
    }

    // Analysis results
    if (response.data) {
      const { blocked, flags, reason, filteredContent } = response.data;
      console.log(`🔍 Violation Detected: ${blocked ? "YES" : "NO"}`);
      if (flags && flags.length > 0) {
        console.log(`🚩 Flags: ${flags.join(", ")}`);
      }
      if (reason) {
        console.log(`💭 AI Reasoning: ${reason}`);
      }
      if (filteredContent) {
        console.log(`🔄 Filtered Content: "${filteredContent}"`);
      }
    }
  } catch (error) {
    const endTime = Date.now();
    const clientTime = endTime - startTime;

    console.log(`⏱️  Failed after: ${clientTime}ms`);

    if (error.response) {
      console.log("❌ Error Status:", error.response.status);
      console.log(
        "❌ Error Response:",
        JSON.stringify(error.response.data, null, 2)
      );
    } else {
      console.log("❌ Network Error:", error.message);
    }
  }
}

// Function to test batch requests
async function testBatchRequest() {
  console.log("\n🧪 Test Batch Request with Different Model Tiers");

  const batchData = {
    items: [
      {
        text: "You stupid idiot, I can't believe how dumb you are! This is the worst service I've ever experienced.",
        model: "pro",
        config: {
          allowAbuse: false,
          returnFilteredMessage: true,
        },
      },
      {
        text: "My contact info is sarah.johnson@company.com and my phone is (555) 987-6543. Let's schedule a meeting!",
        model: "fast",
        config: {
          allowEmail: false,
          allowPhone: false,
          returnFilteredMessage: true,
        },
      },
      {
        text: "I'm going to find out where you live and make you pay for this. You better watch yourself.",
        model: "normal",
        config: {
          allowAbuse: false,
          allowPhysicalInformation: false,
          returnFilteredMessage: true,
        },
      },
    ],
  };

  console.log("📤 Batch Request:", JSON.stringify(batchData, null, 2));

  try {
    const response = await axios.post(
      `${BASE_URL}/v1/filter/batch`,
      batchData,
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );

    console.log("✅ Batch Status:", response.status);
    console.log("📥 Batch Response:", JSON.stringify(response.data, null, 2));
  } catch (error) {
    if (error.response) {
      console.log("❌ Batch Error Status:", error.response.status);
      console.log(
        "❌ Batch Error Response:",
        JSON.stringify(error.response.data, null, 2)
      );
    } else {
      console.log("❌ Batch Network Error:", error.message);
    }
  }
}

// Performance tracking
const performanceResults = {
  pro: [],
  normal: [],
  fast: [],
  default: [],
};

// Main test function
async function runTests() {
  console.log("🚀 Starting Realistic AI Model Tier Performance Tests");
  console.log("🔗 Base URL:", BASE_URL);
  console.log("🔑 Using API Key:", API_KEY.substring(0, 8) + "...");
  console.log("📝 Testing with realistic content that requires AI analysis");
  console.log("");

  // Test individual requests
  for (const testCaseData of testCases) {
    await testCase(testCaseData);
    await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds between tests for better analysis
  }

  // Test batch request
  await testBatchRequest();

  console.log("\n✨ All tests completed!");
  console.log("\n📊 PERFORMANCE COMPARISON GUIDE:");
  console.log("=================================");
  console.log("🏆 Pro Tier (Qwen3-235B-A22B-FP8):");
  console.log("   - Highest accuracy for complex abuse detection");
  console.log("   - Best at detecting subtle threats and harassment");
  console.log("   - Slower response times but superior reasoning");
  console.log("");
  console.log("⚖️  Normal Tier (Meta-Llama-3-3-70B-Instruct):");
  console.log("   - Balanced accuracy and speed");
  console.log("   - Good for general content filtering");
  console.log("   - Default choice for most use cases");
  console.log("");
  console.log("⚡ Fast Tier (Meta-Llama-3-1-8B-Instruct-FP8):");
  console.log("   - Fastest response times");
  console.log("   - Good accuracy for straightforward cases");
  console.log("   - Best for high-volume, simple filtering");
  console.log("");
  console.log("📋 What to Compare:");
  console.log("- Response times (client-side vs server processing)");
  console.log("- Detection accuracy for different content types");
  console.log("- Quality of AI reasoning and explanations");
  console.log("- Filtered content quality and naturalness");
  console.log("- Check server logs for actual model usage confirmation");
}

// Check if server is running
async function checkServer() {
  try {
    const response = await axios.get(`${BASE_URL}/v1/filter/health`);
    console.log("✅ Server is running");
    return true;
  } catch (error) {
    console.log("❌ Server is not running or not accessible");
    console.log("💡 Make sure to start the server with: bun run dev");
    return false;
  }
}

// Run the tests
async function main() {
  console.log("🧪 Model Tier Testing Script");
  console.log("============================");
  console.log(
    "🔑 API Key:",
    API_KEY !== "test-api-key"
      ? "✅ Loaded from DEV_API_KEY"
      : "⚠️  Using default test key"
  );
  console.log("");

  const serverRunning = await checkServer();
  if (serverRunning) {
    await runTests();
  } else {
    console.log("\n💡 To start the server, run: bun run dev");
    console.log("💡 To test model tiers, run: bun run test:model-tiers");
  }
}

main().catch(console.error);
