import { NextResponse } from "next/server";
import { continuitySyncService } from "@/lib/services/agent/continuity-sync-service";
import { runtimeSettingsStore } from "@/lib/services/settings/runtime-settings-store";

async function resolveAgentId(rawAgentId: string): Promise<string> {
  const normalized = rawAgentId.trim().toLowerCase();
  
  // 1. Check known keys
  if (normalized === "atlas" || normalized === "job_scout") {
    try {
      const { prisma } = await import("@/lib/db");
      const agent = await prisma.agent.findFirst({
        where: { key: "job_scout" },
        select: { id: true }
      });
      if (agent) return agent.id;
    } catch { /* fallback */ }
    return "job_scout";
  }
  
  return rawAgentId;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get("agentId");
  const sessionId = searchParams.get("sessionId") || "default";

  if (!agentId) {
    return NextResponse.json({ error: "agentId query param required" }, { status: 400 });
  }

  const resolvedAgentId = await resolveAgentId(agentId);

  const summary = continuitySyncService.getSyncSummary(resolvedAgentId, sessionId);
  const state = continuitySyncService.getContinuityState(resolvedAgentId, sessionId);
  const runtimeSelection = runtimeSettingsStore.get("local-dev-user");

  return NextResponse.json({
    agentId,
    resolvedAgentId,
    sessionId,
    summary,
    usage: {
      totalTokens: runtimeSelection.usage.totalTokens,
      lastUpdated: runtimeSelection.updatedAt,
    },
    layers: {
      soul: {
        mission: state.soul.mission,
        longTermPurpose: state.soul.longTermPurpose,
        nonNegotiableRules: state.soul.nonNegotiableRules,
        values: state.soul.values,
        decisionPhilosophy: state.soul.decisionPhilosophy,
      },
      identity: {
        name: state.identity.name,
        roleDefinition: state.identity.roleDefinition,
        specialization: state.identity.specialization,
        communicationStyle: state.identity.communicationStyle,
        strengths: state.identity.strengths,
        weaknesses: state.identity.weaknesses,
      },
      agent: {
        mode: state.mind.mode,
        reasoningMode: state.mind.reasoningMode,
        loopPreventionState: state.mind.loopPreventionState,
        currentStrategy: state.mind.currentStrategy,
        pendingActions: state.mind.pendingActions,
        operatingAssumptions: state.mind.operatingAssumptions,
      },
      memory: {
        // High-level sync disabled as per user request
        summaries: [],
        todos: [],
      },
      history: {
        recentTurnCount: state.history.recentTurns.length,
        summaryCount: state.history.summaries.length,
        currentDirection: state.history.currentDirection,
        unresolvedThreads: state.history.unresolvedThreads,
        importantDecisions: state.history.importantDecisions,
      },
    },
  });
}

export async function POST(request: Request) {
  try {
    const json = (await request.json()) as Record<string, unknown>;
    const agentId = typeof json.agentId === "string" ? json.agentId : null;
    const sessionId = typeof json.sessionId === "string" ? json.sessionId : "default";

    if (!agentId) {
      return NextResponse.json({ error: "agentId required in body" }, { status: 400 });
    }

    const resolvedAgentId = await resolveAgentId(agentId);

    const triggerType = json.triggerType === "context-checkpoint" ? "context-checkpoint" : "major-step-post";
    const description = typeof json.description === "string" ? json.description : "Manual sync triggered";

    await continuitySyncService.syncAll(resolvedAgentId, sessionId, triggerType, {
      stepDescription: description,
      nextIntendedStep: typeof json.nextStep === "string" ? json.nextStep : "Awaiting next user message.",
    });

    const summary = continuitySyncService.getSyncSummary(resolvedAgentId, sessionId);
    return NextResponse.json({ synced: true, agentId, resolvedAgentId, sessionId, summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
