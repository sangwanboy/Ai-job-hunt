import type { MemoryKind, MessageRole } from "@/lib/domain/enums";
import { prisma } from "@/lib/db";

export type AgentRecord = {
  id: string;
  userId: string;
  key: string;
  onboardingCompleted: boolean;
  responseBudgetTokens: number;
  memoryBudgetTokens: number;
  soulMission: string;
  identityName: string;
  communicationStyle: string;
  model: string;
};

type OnboardingInput = {
  desiredName: string;
  desiredHelp: string;
  desiredStyle: string;
  rememberNotes: string;
};

type ConversationalOnboardingInput = OnboardingInput & {
  roleTitle: string;
  specialization: string;
  communicationStyle: string;
  soulMission: string;
  longTermObjective: string;
  principles: string[];
  decisionPhilosophy: string;
  mindModel: string;
  mindConstraints: string[];
};

export class AgentStore {
  async findAgent(agentRef: string, userId?: string): Promise<AgentRecord | null> {
    const agent = await prisma.agent.findFirst({
      where: {
        OR: [{ id: agentRef }, { key: agentRef }],
        ...(userId ? { userId } : {}),
      },
      include: {
        soul: true,
        identity: true,
        mindConfig: true,
      },
    });

    if (!agent || !agent.soul || !agent.identity || !agent.mindConfig) {
      return null;
    }

    return {
      id: agent.id,
      userId: agent.userId,
      key: agent.key,
      onboardingCompleted: agent.onboardingCompleted,
      responseBudgetTokens: agent.responseBudgetTokens,
      memoryBudgetTokens: agent.memoryBudgetTokens,
      soulMission: agent.soul.mission,
      identityName: agent.identity.name,
      communicationStyle: agent.identity.communicationStyle,
      model: agent.mindConfig.model,
    };
  }

  async createOrReuseSession(input: {
    sessionId?: string;
    userId: string;
    agentId: string;
    message: string;
  }): Promise<string> {
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
  }

  async saveMessage(input: {
    sessionId: string;
    role: MessageRole;
    content: string;
    tokenEstimate: number;
  }): Promise<void> {
    await prisma.chatMessage.create({
      data: {
        sessionId: input.sessionId,
        role: input.role,
        content: input.content,
        tokenEstimate: input.tokenEstimate,
      },
    });
  }

  async upsertOnboarding(agentId: string, onboarding: OnboardingInput): Promise<void> {
    await prisma.agentOnboardingProfile.upsert({
      where: { agentId },
      update: {
        desiredName: onboarding.desiredName,
        desiredHelp: onboarding.desiredHelp,
        desiredStyle: onboarding.desiredStyle,
        rememberNotes: onboarding.rememberNotes,
      },
      create: {
        agentId,
        desiredName: onboarding.desiredName,
        desiredHelp: onboarding.desiredHelp,
        desiredStyle: onboarding.desiredStyle,
        rememberNotes: onboarding.rememberNotes,
      },
    });

    await prisma.agent.update({
      where: { id: agentId },
      data: {
        onboardingCompleted: true,
        personalityStyle: onboarding.desiredStyle,
        desiredHelpMode: onboarding.desiredHelp,
      },
    });

    await prisma.agentIdentity.updateMany({
      where: { agentId },
      data: {
        name: onboarding.desiredName,
        communicationStyle: onboarding.desiredStyle,
      },
    });
  }

  async applyConversationalOnboarding(agentId: string, onboarding: ConversationalOnboardingInput): Promise<void> {
    await this.upsertOnboarding(agentId, onboarding);

    await prisma.agentSoul.updateMany({
      where: { agentId },
      data: {
        mission: onboarding.soulMission,
        longTermObjective: onboarding.longTermObjective,
        principles: onboarding.principles,
        decisionPhilosophy: onboarding.decisionPhilosophy,
      },
    });

    await prisma.agentIdentity.updateMany({
      where: { agentId },
      data: {
        name: onboarding.desiredName,
        roleTitle: onboarding.roleTitle,
        specialization: onboarding.specialization,
        communicationStyle: onboarding.communicationStyle,
      },
    });

    await prisma.agentMindConfig.updateMany({
      where: { agentId },
      data: {
        model: onboarding.mindModel,
        constraints: onboarding.mindConstraints,
      },
    });
  }

  async saveMemoryChunk(input: {
    agentId: string;
    userId: string;
    kind: MemoryKind;
    content: string;
    summary?: string;
    importanceScore?: number;
    tokenEstimate?: number;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await prisma.agentMemoryChunk.create({
      data: {
        agentId: input.agentId,
        userId: input.userId,
        kind: input.kind,
        content: input.content,
        summary: input.summary,
        importanceScore: input.importanceScore ?? 0.6,
        tokenEstimate: input.tokenEstimate ?? Math.ceil(input.content.length / 4),
        metadata: input.metadata ? JSON.parse(JSON.stringify(input.metadata)) : undefined,
      },
    });
  }

  async getMemorySummary(agentId: string, topK = 3): Promise<string> {
    const chunks = await prisma.agentMemoryChunk.findMany({
      where: { agentId },
      orderBy: [{ importanceScore: "desc" }, { updatedAt: "desc" }],
      take: topK,
      select: {
        summary: true,
        content: true,
      },
    });

    const typedChunks = chunks as Array<{ summary: string | null; content: string }>;

    return typedChunks
      .map((chunk) => chunk.summary?.trim() || chunk.content.trim())
      .filter(Boolean)
      .join(" | ");
  }

  async getMemoryCount(agentId: string): Promise<number> {
    return prisma.agentMemoryChunk.count({ where: { agentId } });
  }

  async compactMemory(agentId: string, summary: string): Promise<void> {
    await prisma.agentSummaryMemory.create({
      data: {
        agentId,
        summary,
        sourceMessageCount: 0,
        tokenSavedEstimate: Math.ceil(summary.length / 2),
      },
    });

    await prisma.memoryCompactionLog.create({
      data: {
        agentId,
        beforeCount: 0,
        afterCount: 0,
        tokenSavedEstimate: Math.ceil(summary.length / 2),
        summary,
      },
    });
  }
  async listSessions(input: { agentId: string; userId?: string }): Promise<Array<{ id: string; title: string; updatedAt: Date }>> {
    if (!input.agentId) {
      return [];
    }

    try {
      const agent = await prisma.agent.findFirst({
        where: {
          OR: [{ id: input.agentId }, { key: input.agentId }],
          ...(input.userId ? { userId: input.userId } : {}),
        },
        select: { id: true },
      });

      if (!agent) {
        return [];
      }

      return await prisma.chatSession.findMany({
        where: {
          agentId: agent.id,
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
    } catch (error) {
      console.error("Prisma error in listSessions:", error);
      return [];
    }
  }

  async getSessionMessages(sessionId: string): Promise<Array<{ role: MessageRole; content: string; createdAt: Date }>> {
    return prisma.chatMessage.findMany({
      where: { sessionId },
      select: {
        role: true,
        content: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });
  }
}

export const agentStore = new AgentStore();
