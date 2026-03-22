const PORT = 3001;

async function testBrowser() {
  console.log("🧪 Testing Standalone Browser Service...");
  
  try {
    // 1. Check Health
    console.log("\n1️⃣ Checking Health...");
    const healthRes = await fetch(`http://localhost:${PORT}/health`);
    const health = await healthRes.json();
    console.log("Result:", health);

    // 2. Create Session
    console.log("\n2️⃣ Creating Session...");
    const sessionRes = await fetch(`http://localhost:${PORT}/api/browser`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create_session",
        sessionId: "test-session",
        params: { userId: "local-dev-user" }
      })
    });
    const session = await sessionRes.json();
    console.log("Result:", session);

    // 3. Navigate
    console.log("\n3️⃣ Navigating to Google...");
    const navigateRes = await fetch(`http://localhost:${PORT}/api/browser`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "navigate",
        sessionId: session.sessionId,
        params: { url: "https://www.google.com" }
      })
    });
    const navigate = await navigateRes.json();
    console.log("Result:", navigate);

    // 4. Screenshot
    console.log("\n4️⃣ Taking Screenshot...");
    const screenshotRes = await fetch(`http://localhost:${PORT}/api/browser`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "snapshot",
        sessionId: session.sessionId,
        params: { fileName: "test-google.png" }
      })
    });
    const screenshot = await screenshotRes.json();
    console.log("Result:", screenshot);

    console.log("\n✅ Browser Test Complete!");
  } catch (error) {
    console.error("\n❌ Test Failed:", error.message);
    console.log("\nHELP: Make sure you started the browser service first:");
    console.log("npx tsx server.js");
  }
}

testBrowser();
