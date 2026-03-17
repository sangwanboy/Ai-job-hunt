import { NextResponse } from "next/server";
import { z } from "zod";
import { agentBrowserToolRegistry } from "@/lib/services/browser/tools/agent-browser-tool-registry";
import type { BrowserToolName } from "@/lib/services/browser/types/browser-types";

const browserToolRequestSchema = z
  .object({
    tool: z.enum([
      "browser_launch_browser",
      "browser_create_session",
      "browser_open_session",
      "browser_open_page",
      "browser_navigate",
      "browser_click",
      "browser_type",
      "browser_scroll",
      "browser_extract_text",
      "browser_screenshot",
      "browser_close_session",
    ]),
    input: z.unknown().optional(),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const json = (await request.json()) as unknown;
    const payload = browserToolRequestSchema.parse(json);

    const result = await agentBrowserToolRegistry.execute(payload.tool as BrowserToolName, payload.input ?? {});
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Browser tool request failed";
    return NextResponse.json(
      {
        status: "error",
        timestamp: new Date().toISOString(),
        error: {
          code: "BROWSER_TOOL_ROUTE_ERROR",
          message,
        },
      },
      { status: 400 },
    );
  }
}
