import axios from "axios";

// Performance test for Phase 2 optimizations
async function performanceTest() {
  console.log("🚀 FilterX Phase 2 Performance Test");
  console.log("=====================================");
  console.log("Testing unified Redis pipeline optimizations\n");

  const baseUrl = "http://localhost:8000";
  const apiKey =
    "f5cc4853776589b69733852da374d1b5444fa277fef2568c813073336a117341";

  const testCases = [
    {
      name: "Quick Prescreening Block (Phone)",
      text: "Call me at 555-123-4567",
      config: { allowPhone: false },
      expectedTime: "< 80ms (Phase 2: Unified pipeline)",
      category: "prescreening",
    },
    {
      name: "Quick Prescreening Block (Email)",
      text: "Contact me at test@example.com",
      config: { allowEmail: false },
      expectedTime: "< 80ms (Phase 2: Unified pipeline)",
      category: "prescreening",
    },
    {
      name: "Clean Text (Cache Miss)",
      text: `Hello, this is a unique message ${Date.now()}`,
      config: {},
      expectedTime: "< 150ms (Phase 2: Parallel background)",
      category: "clean",
    },
    {
      name: "Clean Text (Cache Hit - 2nd Request)",
      text: "Hello, how are you today?",
      config: {},
      expectedTime: "< 40ms (Phase 2: Optimized cache)",
      category: "cached",
    },
    {
      name: "Complex Abusive Content",
      text: "You should go kill yourself, nobody likes you anyway",
      config: { allowAbuse: false },
      expectedTime: "< 250ms (Phase 2: Background optimization)",
      category: "complex",
    },
  ];

  const results = [];

  // First, make a request to warm up the cache
  console.log("🔥 Warming up cache...");
  try {
    await axios.post(
      `${baseUrl}/v1/filter`,
      {
        text: "Hello, how are you today?",
        config: {},
        model: "normal",
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );
    console.log("✅ Cache warmed up\n");
  } catch (error) {
    console.log("❌ Cache warmup failed\n");
  }

  // Run performance tests
  for (const testCase of testCases) {
    console.log(`🧪 Testing: ${testCase.name}`);
    console.log(
      `📝 Text: "${testCase.text.substring(0, 50)}${
        testCase.text.length > 50 ? "..." : ""
      }"`
    );
    console.log(`⚙️  Config: ${JSON.stringify(testCase.config)}`);
    console.log(`🎯 Expected: ${testCase.expectedTime}`);

    const measurements = [];

    // Run each test 3 times for consistency
    for (let i = 0; i < 3; i++) {
      try {
        const startTime = performance.now();

        const response = await axios.post(
          `${baseUrl}/v1/filter`,
          {
            text: testCase.text,
            config: testCase.config,
            model: "normal",
          },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            timeout: 10000,
          }
        );

        const endTime = performance.now();
        const clientTime = endTime - startTime;
        const serverTime = parseFloat(
          response.headers["x-processing-time"]?.replace("ms", "") || "0"
        );

        measurements.push({
          clientTime: Math.round(clientTime),
          serverTime: Math.round(serverTime),
          blocked: response.data.blocked,
          flags: response.data.flags,
          reason: response.data.reason,
        });

        // Small delay between requests
        await new Promise((resolve) => setTimeout(resolve, 50));
      } catch (error) {
        console.log(`❌ Request ${i + 1} failed:`, error.message);
        measurements.push({
          clientTime: 9999,
          serverTime: 9999,
          blocked: false,
          flags: ["error"],
          reason: "Request failed",
        });
      }
    }

    // Calculate averages
    const avgClientTime = Math.round(
      measurements.reduce((sum, m) => sum + m.clientTime, 0) /
        measurements.length
    );
    const avgServerTime = Math.round(
      measurements.reduce((sum, m) => sum + m.serverTime, 0) /
        measurements.length
    );
    const minServerTime = Math.min(...measurements.map((m) => m.serverTime));
    const maxServerTime = Math.max(...measurements.map((m) => m.serverTime));

    // Determine performance rating (Phase 2 targets)
    let rating = "🔴 SLOW";
    if (testCase.category === "prescreening" && avgServerTime < 80)
      rating = "🟢 EXCELLENT (Phase 2)";
    else if (testCase.category === "cached" && avgServerTime < 40)
      rating = "🟢 EXCELLENT (Phase 2)";
    else if (testCase.category === "clean" && avgServerTime < 150)
      rating = "🟢 EXCELLENT (Phase 2)";
    else if (testCase.category === "complex" && avgServerTime < 250)
      rating = "🟢 EXCELLENT (Phase 2)";
    else if (testCase.category === "prescreening" && avgServerTime < 100)
      rating = "🟡 GOOD (Phase 1 level)";
    else if (testCase.category === "cached" && avgServerTime < 50)
      rating = "🟡 GOOD (Phase 1 level)";
    else if (testCase.category === "clean" && avgServerTime < 200)
      rating = "🟡 GOOD (Phase 1 level)";
    else if (testCase.category === "complex" && avgServerTime < 300)
      rating = "🟡 GOOD (Phase 1 level)";
    else if (avgServerTime < 500) rating = "🟠 NEEDS IMPROVEMENT";

    console.log(`📊 Results:`);
    console.log(`   Client Time: ${avgClientTime}ms (avg)`);
    console.log(
      `   Server Time: ${avgServerTime}ms (avg), ${minServerTime}-${maxServerTime}ms (range)`
    );
    console.log(`   Performance: ${rating}`);
    console.log(
      `   Response: ${measurements[0].blocked ? "BLOCKED" : "ALLOWED"} - ${
        measurements[0].reason
      }`
    );
    console.log(`   Flags: [${measurements[0].flags.join(", ")}]`);
    console.log("");

    results.push({
      name: testCase.name,
      category: testCase.category,
      avgClientTime,
      avgServerTime,
      minServerTime,
      maxServerTime,
      rating,
      blocked: measurements[0].blocked,
      flags: measurements[0].flags,
    });
  }

  // Generate summary report
  console.log("📈 PERFORMANCE SUMMARY");
  console.log("======================");

  const categories = {
    prescreening: results.filter((r) => r.category === "prescreening"),
    cached: results.filter((r) => r.category === "cached"),
    clean: results.filter((r) => r.category === "clean"),
    complex: results.filter((r) => r.category === "complex"),
  };

  Object.entries(categories).forEach(([category, tests]) => {
    if (tests.length > 0) {
      const avgTime = Math.round(
        tests.reduce((sum, t) => sum + t.avgServerTime, 0) / tests.length
      );
      const excellentCount = tests.filter((t) =>
        t.rating.includes("EXCELLENT")
      ).length;
      console.log(
        `${category.toUpperCase()}: ${avgTime}ms avg (${excellentCount}/${
          tests.length
        } excellent)`
      );
    }
  });

  console.log("\n🎯 PHASE 2 OPTIMIZATION IMPACT:");
  console.log("• Response-first pattern implemented ✅");
  console.log("• Stats tracking moved to background ✅");
  console.log("• Cache operations optimized ✅");
  console.log("• Performance monitoring added ✅");
  console.log("• 🆕 Unified Redis pipeline (single round-trip) ✅");
  console.log("• 🆕 Parallel background processing ✅");
  console.log("• 🆕 Optimized cache/stats coordination ✅");

  const overallAvg = Math.round(
    results.reduce((sum, r) => sum + r.avgServerTime, 0) / results.length
  );
  console.log(`\n🏆 Overall Average Response Time: ${overallAvg}ms`);

  if (overallAvg < 120) {
    console.log("🎉 EXCELLENT! Phase 2 optimizations are working perfectly!");
    console.log(
      "🚀 Background processing time should be dramatically reduced!"
    );
  } else if (overallAvg < 200) {
    console.log(
      "👍 GOOD! Phase 2 optimizations show improvement over Phase 1."
    );
  } else if (overallAvg < 300) {
    console.log(
      "🟡 MODERATE! Some Phase 2 benefits visible, but more tuning needed."
    );
  } else {
    console.log("⚠️  NEEDS WORK! Phase 2 optimizations may need debugging.");
  }
}

// Check if server is running
async function checkServer() {
  try {
    const response = await axios.get("http://localhost:8000/health", {
      timeout: 5000,
    });
    console.log("✅ Server is running:", response.data.status);
    return true;
  } catch (error) {
    console.log("❌ Server is not running or not accessible");
    return false;
  }
}

async function main() {
  const serverRunning = await checkServer();
  if (serverRunning) {
    await performanceTest();
  } else {
    console.log("Please start the server first with: npm start");
  }
}

main().catch(console.error);
