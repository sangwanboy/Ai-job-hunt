import { NextResponse } from "next/server";
import { z } from "zod";
import { agentBrowserToolRegistry } from "@/lib/services/browser/tools/agent-browser-tool-registry";
import type { BrowserToolName } from "@/lib/services/browser/types/browser-types";

// Unified Browser API Schema based on USER request and internal registry
const browserRequestSchema = z.object({
  action: z.enum([
    "navigate",
    "click",
    "type",
    "scroll",
    "snapshot",
    "extract",
    "extract_jobs",
    "close"
  ]),
  sessionId: z.string().min(1),
  params: z.record(z.unknown()).optional()
});

// Map external actions to internal tool names
const actionToToolMap: Record<string, BrowserToolName> = {
  navigate: "browser_navigate",
  click: "browser_click",
  type: "browser_type",
  scroll: "browser_scroll",
  snapshot: "browser_screenshot",
  extract: "browser_extract_text",
  extract_jobs: "browser_extract_jobs",
  close: "browser_close_session"
};

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const { action, sessionId, params } = browserRequestSchema.parse(json);

    const toolName = actionToToolMap[action];
    
    // Ensure we have a valid session and browser ready
    // Note: The registry handles session re-attachment or creation if needed
    const result = await agentBrowserToolRegistry.execute(toolName, {
      sessionId,
      ...params
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Browser API request failed";
    return NextResponse.json(
      {
        status: "error",
        timestamp: new Date().toISOString(),
        error: {
          code: "BROWSER_API_ERROR",
          message,
        },
      },
      { status: 400 }
    );
  }
}
