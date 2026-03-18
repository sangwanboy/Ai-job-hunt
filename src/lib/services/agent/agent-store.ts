import type { MemoryKind, MessageRole } from "@/lib/domain/enums";
import { prisma } from "@/lib/db";
import { localSessionStore } from "@/lib/services/agent/local-session-store";

export type AgentRecord = {
  id: string;
  userId: string;
  key: string;
  soulMission: string;
  identityName: string;
  communicationStyle: string;
  model: string;
  onboardingCompleted: boolean;
  responseBudgetTokens: number;
  memoryBudgetTokens: number;
};

export class AgentStore {
  async findAgent(agentId: string, userId: string): Promise<AgentRecord | null> {
    try {
      const agent = await prisma.agent.findFirst({
        where: {
          OR: [{ id: agentId }, { key: agentId }],
          userId,
        },
        include: {
          soul: true,
          identity: true,
          mindConfig: true,
        },
      });

      if (!agent) return null;

      return {
        id: agent.id,
        userId: agent.userId,
        key: agent.key,
        soulMission: agent.soul?.mission || "",
        identityName: agent.identity?.name || "",
        communicationStyle: agent.identity?.communicationStyle || "",
        model: agent.mindConfig?.model || "gemini-3.1-flash-lite-preview",
        onboardingCompleted: agent.onboardingCompleted,
        responseBudgetTokens: agent.responseBudgetTokens,
        memoryBudgetTokens: agent.memoryBudgetTokens,
      };
    } catch (error) {
      console.error("[AgentStore] findAgent failed:", error);
      return null;
    }
  }

  async createOrReuseSession(input: {
    sessionId?: string;
    userId: string;
    agentId: string;
    message: string;
  }): Promise<string> {
    const fallbackId = input.sessionId || `local-${crypto.randomUUID()}`;
    try {
      if (input.sessionId) {
        const existing = await prisma.chatSession.findFirst({
          where: {
            id: input.sessionId,
            userId: input.userId,
            agentId: input.agentId,
          },
          select: { id: true },
        });
        if (existing) {
          return existing.id;
        }
      }

      const created = await prisma.chatSession.create({
        data: {
          userId: input.userId,
          agentId: input.agentId,
          title: input.message.slice(0, 80),
        },
        select: { id: true },
      });

      return created.id;
    } catch (dbError) {
      console.warn("[AgentStore] DB failed in createOrReuseSession, using ID:", fallbackId);
      return fallbackId;
    }
  }

  async saveMessage(input: {
    sessionId: string;
    role: MessageRole;
    content: string;
    tokenEstimate: number;
    agentId?: string; // Optional for compatibility
    userId?: string;  // Optional for compatibility
  }): Promise<void> {
    // 1. Try DB first
    try {
      await prisma.chatMessage.create({
        data: {
          sessionId: input.sessionId,
          role: input.role,
          content: input.content,
          tokenEstimate: input.tokenEstimate,
        },
      });
    } catch (dbError) {
      console.warn("[AgentStore] DB failed to save message:", dbError instanceof Error ? dbError.message : "Unknown error");
    }

    // 2. Always write to local store as a robust secondary/fallback
    const agentId = input.agentId || "job_scout";
    const userId = input.userId || "local-dev-user";
    
    try {
      await localSessionStore.saveMessage({
        sessionId: input.sessionId,
        agentId,
        userId,
        role: input.role,
        content: input.content,
      });
    } catch (localError) {
      console.error("[AgentStore] Local session save failed:", localError);
    }
  }

  // ... (upsertOnboarding, applyConversationalOnboarding, etc. remain the same)

  async listSessions(input: { agentId: string; userId?: string }): Promise<Array<{ id: string; title: string; updatedAt: Date }>> {
    if (!input.agentId) {
      return [];
    }

    const userId = input.userId || "local-dev-user";
    
    let resolvedAgentId = input.agentId;
    let resolvedAgentKey = input.agentId;

    try {
      const agent = await prisma.agent.findFirst({
        where: {
          OR: [{ id: input.agentId }, { key: input.agentId }],
          ...(input.userId ? { userId: input.userId } : {}),
        },
        select: { id: true, key: true },
      });

      if (agent) {
        resolvedAgentId = agent.id;
        resolvedAgentKey = agent.key;
      }
    } catch (dbError) {
      console.warn("[AgentStore] DB error resolving agent in listSessions, using raw ID for filtering.");
    }

    // Pass resolved IDs/keys to local store
    const localSessions = await localSessionStore.list(resolvedAgentId, userId, resolvedAgentKey);

    try {
      // If we don't have a resolved agent ID from DB and DB is working, we might still want to try filtering by raw input
      const dbSessions = await prisma.chatSession.findMany({
        where: {
          agentId: resolvedAgentId,
          userId: input.userId,
          isArchived: false,
        },
        select: {
          id: true,
          title: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: "desc" },
      });

      // Merge and unique-ify by ID, preferring local for recency/updates if desired, 
      // but here we just combine to ensure everything is visible.
      const merged = [...dbSessions];
      for (const ls of localSessions) {
        if (!merged.find(s => s.id === ls.id)) {
          merged.push({ id: ls.id, title: ls.title, updatedAt: new Date(ls.updatedAt) });
        }
      }
      return merged.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    } catch (error) {
      console.warn("[AgentStore] DB error in listSessions, returning local only.");
      return localSessions.map(ls => ({ id: ls.id, title: ls.title, updatedAt: new Date(ls.updatedAt) }));
    }
  }

  async getSessionMessages(sessionId: string): Promise<Array<{ role: MessageRole; content: string; createdAt: Date }>> {
    try {
      const dbMessages = await prisma.chatMessage.findMany({
        where: { sessionId },
        select: {
          role: true,
          content: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      });
      
      if (dbMessages.length > 0) return dbMessages;
    } catch (error) {
      console.warn("[AgentStore] DB error in getSessionMessages");
    }

    // Fallback to local
    const local = await localSessionStore.get(sessionId);
    if (local) {
      return local.messages.map(m => ({
        role: m.role,
        content: m.content,
        createdAt: new Date(m.createdAt)
      }));
    }

    return [];
  }
}

export const agentStore = new AgentStore();
