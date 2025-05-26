import axios from "axios";

// Phase 2 vs Phase 1 comparison test
async function phase2Comparison() {
  console.log("🔬 Phase 2 vs Phase 1 Performance Comparison");
  console.log("==============================================");
  console.log("Analyzing background processing improvements\n");
  
  const baseUrl = "http://localhost:8000";
  const apiKey = "f5cc4853776589b69733852da374d1b5444fa277fef2568c813073336a117341";
  
  // Test case designed to trigger background processing
  const testCase = {
    text: "Contact me at test@example.com for more info",
    config: { allowEmail: false },
    model: 'normal'
  };
  
  console.log("📝 Test Case:");
  console.log(`   Text: "${testCase.text}"`);
  console.log(`   Config: ${JSON.stringify(testCase.config)}`);
  console.log(`   Expected: Email blocked by prescreening + background stats\n`);
  
  const measurements = [];
  const numTests = 5;
  
  console.log(`🧪 Running ${numTests} test iterations...\n`);
  
  for (let i = 0; i < numTests; i++) {
    try {
      const startTime = performance.now();
      
      const response = await axios.post(`${baseUrl}/v1/filter`, testCase, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
      
      const endTime = performance.now();
      const clientTime = Math.round(endTime - startTime);
      const serverTime = parseFloat(response.headers['x-processing-time']?.replace('ms', '') || '0');
      
      measurements.push({
        iteration: i + 1,
        clientTime,
        serverTime,
        blocked: response.data.blocked,
        flags: response.data.flags,
        reason: response.data.reason
      });
      
      console.log(`   Test ${i + 1}: ${serverTime}ms server, ${clientTime}ms client - ${response.data.blocked ? 'BLOCKED' : 'ALLOWED'}`);
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.log(`   Test ${i + 1}: FAILED - ${error.message}`);
      measurements.push({
        iteration: i + 1,
        clientTime: 9999,
        serverTime: 9999,
        blocked: false,
        flags: ['error'],
        reason: 'Request failed'
      });
    }
  }
  
  // Calculate statistics
  const validMeasurements = measurements.filter(m => m.serverTime < 9999);
  if (validMeasurements.length === 0) {
    console.log("\n❌ All tests failed, cannot analyze performance");
    return;
  }
  
  const avgServerTime = Math.round(
    validMeasurements.reduce((sum, m) => sum + m.serverTime, 0) / validMeasurements.length
  );
  const minServerTime = Math.min(...validMeasurements.map(m => m.serverTime));
  const maxServerTime = Math.max(...validMeasurements.map(m => m.serverTime));
  const avgClientTime = Math.round(
    validMeasurements.reduce((sum, m) => sum + m.clientTime, 0) / validMeasurements.length
  );
  
  console.log("\n📊 PERFORMANCE ANALYSIS");
  console.log("========================");
  console.log(`Server Response Time: ${avgServerTime}ms avg (${minServerTime}-${maxServerTime}ms range)`);
  console.log(`Client Total Time: ${avgClientTime}ms avg`);
  console.log(`Valid Tests: ${validMeasurements.length}/${numTests}`);
  
  // Phase comparison analysis
  console.log("\n🔍 PHASE COMPARISON ANALYSIS");
  console.log("=============================");
  
  // Phase 1 baseline (from logs analysis)
  const phase1Baseline = {
    coreTime: 520,
    backgroundTime: 601,
    totalTime: 1122
  };
  
  console.log("📈 Phase 1 Baseline (from previous logs):");
  console.log(`   Core Processing: ${phase1Baseline.coreTime}ms`);
  console.log(`   Background Tasks: ${phase1Baseline.backgroundTime}ms`);
  console.log(`   Total Time: ${phase1Baseline.totalTime}ms`);
  
  console.log("\n📈 Phase 2 Current Results:");
  console.log(`   Core Processing: ${avgServerTime}ms (API response time)`);
  console.log(`   Background Tasks: Estimated ${Math.max(0, avgClientTime - avgServerTime)}ms`);
  console.log(`   Total Time: ${avgClientTime}ms`);
  
  // Calculate improvements
  const coreImprovement = ((phase1Baseline.coreTime - avgServerTime) / phase1Baseline.coreTime * 100);
  const estimatedBackgroundTime = Math.max(0, avgClientTime - avgServerTime);
  const backgroundImprovement = ((phase1Baseline.backgroundTime - estimatedBackgroundTime) / phase1Baseline.backgroundTime * 100);
  const totalImprovement = ((phase1Baseline.totalTime - avgClientTime) / phase1Baseline.totalTime * 100);
  
  console.log("\n🎯 IMPROVEMENT ANALYSIS:");
  console.log(`   Core Processing: ${coreImprovement > 0 ? '+' : ''}${coreImprovement.toFixed(1)}% ${coreImprovement > 0 ? 'improvement' : 'regression'}`);
  console.log(`   Background Tasks: ${backgroundImprovement > 0 ? '+' : ''}${backgroundImprovement.toFixed(1)}% ${backgroundImprovement > 0 ? 'improvement' : 'regression'}`);
  console.log(`   Total Time: ${totalImprovement > 0 ? '+' : ''}${totalImprovement.toFixed(1)}% ${totalImprovement > 0 ? 'improvement' : 'regression'}`);
  
  // Phase 2 success criteria
  console.log("\n✅ PHASE 2 SUCCESS CRITERIA:");
  
  const criteria = [
    {
      name: "Core processing maintained",
      target: "< 600ms",
      actual: avgServerTime,
      passed: avgServerTime < 600
    },
    {
      name: "Background processing improved",
      target: "< 200ms",
      actual: estimatedBackgroundTime,
      passed: estimatedBackgroundTime < 200
    },
    {
      name: "Total time improved",
      target: "< 800ms",
      actual: avgClientTime,
      passed: avgClientTime < 800
    },
    {
      name: "Background improvement",
      target: "> 50%",
      actual: backgroundImprovement,
      passed: backgroundImprovement > 50
    }
  ];
  
  criteria.forEach(criterion => {
    const status = criterion.passed ? "✅ PASS" : "❌ FAIL";
    console.log(`   ${criterion.name}: ${status} (${criterion.actual} vs ${criterion.target})`);
  });
  
  const passedCriteria = criteria.filter(c => c.passed).length;
  const totalCriteria = criteria.length;
  
  console.log(`\n🏆 OVERALL PHASE 2 ASSESSMENT: ${passedCriteria}/${totalCriteria} criteria passed`);
  
  if (passedCriteria === totalCriteria) {
    console.log("🎉 EXCELLENT! Phase 2 optimizations are working perfectly!");
    console.log("🚀 Unified Redis pipeline and parallel processing are delivering expected results!");
  } else if (passedCriteria >= totalCriteria * 0.75) {
    console.log("👍 GOOD! Phase 2 optimizations show significant improvement!");
    console.log("🔧 Minor tuning may be needed for optimal performance.");
  } else if (passedCriteria >= totalCriteria * 0.5) {
    console.log("🟡 MODERATE! Some Phase 2 benefits are visible.");
    console.log("🔍 Further investigation needed to optimize background processing.");
  } else {
    console.log("⚠️  NEEDS WORK! Phase 2 optimizations may need debugging.");
    console.log("🛠️  Check Redis pipeline implementation and background task coordination.");
  }
  
  // Technical recommendations
  console.log("\n🔧 TECHNICAL INSIGHTS:");
  if (avgServerTime > 600) {
    console.log("• Core processing time is higher than expected - check for blocking operations");
  }
  if (estimatedBackgroundTime > 200) {
    console.log("• Background processing still taking too long - verify unified pipeline is working");
  }
  if (backgroundImprovement < 50) {
    console.log("• Background improvement below target - check Redis pipeline consolidation");
  }
  if (avgClientTime > 800) {
    console.log("• Total time still high - verify parallel background processing");
  }
  
  console.log("\n📋 NEXT STEPS:");
  console.log("• Monitor server logs for '[PHASE2]' and '[UNIFIED]' messages");
  console.log("• Check Redis pipeline execution times in logs");
  console.log("• Verify background tasks are running in parallel");
  console.log("• Consider Phase 3 optimizations if Phase 2 targets are met");
}

// Check if server is running
async function checkServer() {
  try {
    const response = await axios.get('http://localhost:8000/health', { timeout: 5000 });
    console.log('✅ Server is running:', response.data.status);
    return true;
  } catch (error) {
    console.log('❌ Server is not running or not accessible');
    return false;
  }
}

async function main() {
  const serverRunning = await checkServer();
  if (serverRunning) {
    await phase2Comparison();
  } else {
    console.log('Please start the server first with: npm start');
  }
}

main().catch(console.error);
