import axios from "axios";

// Test Redis connection fix
async function testRedisFix() {
  console.log("🔧 Testing Redis Connection Fix");
  console.log("================================");
  console.log("Testing Phase 2 error handling improvements\n");
  
  const baseUrl = "http://localhost:8000";
  const apiKey = "f5cc4853776589b69733852da374d1b5444fa277fef2568c813073336a117341";
  
  // Test case that should trigger stats tracking
  const testCase = {
    text: "Contact me at test@example.com",
    config: { allowEmail: false },
    model: 'normal'
  };
  
  console.log("📝 Test Case:");
  console.log(`   Text: "${testCase.text}"`);
  console.log(`   Config: ${JSON.stringify(testCase.config)}`);
  console.log(`   Expected: Email blocked + background stats tracking\n`);
  
  // First, check server health
  console.log("🏥 Checking server health...");
  try {
    const healthResponse = await axios.get(`${baseUrl}/health`, { timeout: 5000 });
    console.log(`✅ Server health: ${healthResponse.data.status}`);
    console.log(`   Redis status: ${healthResponse.data.redis ? 'Connected' : 'Disconnected'}`);
    console.log(`   Database status: ${healthResponse.data.database ? 'Connected' : 'Disconnected'}\n`);
  } catch (error) {
    console.log(`❌ Health check failed: ${error.message}\n`);
    return;
  }
  
  // Run multiple requests to test stability
  console.log("🧪 Running stability test (5 requests)...\n");
  
  for (let i = 1; i <= 5; i++) {
    try {
      console.log(`   Request ${i}:`);
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
      
      console.log(`     ✅ Success: ${serverTime}ms server, ${clientTime}ms total`);
      console.log(`     Response: ${response.data.blocked ? 'BLOCKED' : 'ALLOWED'} - ${response.data.reason}`);
      console.log(`     Flags: [${response.data.flags.join(', ')}]`);
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 200));
      
    } catch (error) {
      console.log(`     ❌ Failed: ${error.message}`);
      if (error.response) {
        console.log(`     Status: ${error.response.status}`);
        console.log(`     Data: ${JSON.stringify(error.response.data)}`);
      }
    }
    console.log("");
  }
  
  // Check health again after requests
  console.log("🏥 Checking server health after requests...");
  try {
    const healthResponse = await axios.get(`${baseUrl}/health`, { timeout: 5000 });
    console.log(`✅ Server health: ${healthResponse.data.status}`);
    console.log(`   Redis status: ${healthResponse.data.redis ? 'Connected' : 'Disconnected'}`);
    console.log(`   Database status: ${healthResponse.data.database ? 'Connected' : 'Disconnected'}`);
    
    if (healthResponse.data.redis) {
      console.log("🎉 SUCCESS: Redis connection is stable!");
    } else {
      console.log("⚠️  WARNING: Redis is disconnected but server is still working (fallback mode)");
    }
  } catch (error) {
    console.log(`❌ Health check failed: ${error.message}`);
  }
  
  console.log("\n🔍 ANALYSIS:");
  console.log("• If all requests succeeded, the Redis error handling fix is working");
  console.log("• Server should continue working even if Redis disconnects");
  console.log("• Background stats tracking should use fallback methods if Redis fails");
  console.log("• Check server logs for '[PHASE2]' messages to see unified pipeline status");
  
  console.log("\n📋 WHAT TO LOOK FOR IN LOGS:");
  console.log("✅ '[Stats] [PHASE2] [UNIFIED]' - Unified pipeline working");
  console.log("✅ '[Stats] [PHASE2] Fallback operations' - Fallback working if Redis fails");
  console.log("✅ 'Redis not ready, using memory cache' - Graceful fallback");
  console.log("❌ 'Redis connection error' followed by crashes - Still needs fixing");
}

// Check if server is running
async function checkServer() {
  try {
    const response = await axios.get('http://localhost:8000/health', { timeout: 5000 });
    console.log('✅ Server is running');
    return true;
  } catch (error) {
    console.log('❌ Server is not running or not accessible');
    console.log('Please start the server first with: bun run dev');
    return false;
  }
}

async function main() {
  const serverRunning = await checkServer();
  if (serverRunning) {
    await testRedisFix();
  }
}

main().catch(console.error);
