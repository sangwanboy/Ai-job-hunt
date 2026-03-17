import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { agentStore } from "@/lib/services/agent/agent-store";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get("agentId");
  const sessionId = searchParams.get("sessionId");
  try {
    let user = await prisma.user.findFirst({
      where: { email: "local-dev-user@ai-job-os.local" },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: "local-dev-user@ai-job-os.local",
          name: "Local Dev User",
        },
      });
    }

    const userId = user.id;
    if (sessionId) {
      const messages = await agentStore.getSessionMessages(sessionId);
      return NextResponse.json({ messages });
    }

    if (agentId) {
      console.log(`[API/Sessions] Listing sessions for agentId="${agentId}", userId="${userId}"`);
      try {
        const sessions = await agentStore.listSessions({ agentId, userId });
        console.log(`[API/Sessions] Found ${sessions.length} sessions`);
        return NextResponse.json({ sessions });
      } catch (innerError) {
        console.error("[API/Sessions] agentStore.listSessions failed:", innerError);
        throw innerError;
      }
    }

    return NextResponse.json({ error: "Missing agentId or sessionId" }, { status: 400 });
  } catch (error) {
    console.error("[API/Sessions] Top-level error:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch session data";
    return NextResponse.json({ 
      error: message, 
      stack: error instanceof Error ? error.stack : undefined 
    }, { status: 500 });
  }
}
