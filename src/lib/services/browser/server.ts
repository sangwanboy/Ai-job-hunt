import { createServer } from "node:http";
import { agentBrowserToolRegistry } from "./tools/agent-browser-tool-registry";

const PORT = 3001;

process.on("unhandledRejection", (reason) => {
  console.error("🚨 Unhandled Rejection at:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("🚨 Uncaught Exception:", error);
  process.exit(1);
});

const server = createServer(async (req, res) => {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === "/health" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }));
    return;
  }

  if (req.url === "/api/browser" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", async () => {
      let attemptedTool = "unknown";
      try {
        const { action, sessionId, params } = JSON.parse(body);
        attemptedTool = `browser_${action}`;
        
        console.log(`[BrowserService] Executing: ${attemptedTool} for session: ${sessionId}`);
        
        const result = await agentBrowserToolRegistry.execute(attemptedTool as any, {
          sessionId,
          ...params
        });

        console.log(`[BrowserService] Success: ${attemptedTool}`);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (error: any) {
        console.error(`[BrowserService] Error in ${attemptedTool}:`, error.message || error);
        if (error.stack) console.error(error.stack);
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          status: "error",
          error: error instanceof Error ? error.message : "Action failed",
          details: error.details || undefined
        }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Browser service running on http://localhost:${PORT}`);
  console.log(`- Health check: http://localhost:${PORT}/health`);
  console.log(`- Browser API: http://localhost:${PORT}/api/browser`);
});
