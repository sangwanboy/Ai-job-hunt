import { activeAgent } from "@/lib/mock/data";
import { agentStore } from "@/lib/services/agent/agent-store";
import type { RegisteredAgent } from "@/lib/services/agent/types";

export class AgentRegistry {
  private readonly fallbackAgents = new Map<string, RegisteredAgent>();

  constructor() {
    const fallback: RegisteredAgent = {
      id: activeAgent.id,
      userId: undefined,
      key: activeAgent.key,
      soulMission: activeAgent.soul.mission,
      identityName: activeAgent.identity.name,
      communicationStyle: activeAgent.identity.communicationStyle,
      model: activeAgent.mind.model,
      onboardingCompleted: activeAgent.onboardingCompleted,
      responseBudgetTokens: activeAgent.responseBudgetTokens,
      memoryBudgetTokens: activeAgent.memoryBudgetTokens,
    };

    this.fallbackAgents.set(activeAgent.id, fallback);
    this.fallbackAgents.set(activeAgent.key, fallback);
  }

  async getAgent(agentId: string, userId?: string): Promise<RegisteredAgent> {
    if (userId) {
      try {
        const dbAgent = await agentStore.findAgent(agentId, userId);
        if (dbAgent) {
          return {
            id: dbAgent.id,
            userId: dbAgent.userId,
            key: dbAgent.key,
            soulMission: dbAgent.soulMission,
            identityName: dbAgent.identityName,
            communicationStyle: dbAgent.communicationStyle,
            model: dbAgent.model,
            onboardingCompleted: dbAgent.onboardingCompleted,
            responseBudgetTokens: dbAgent.responseBudgetTokens,
            memoryBudgetTokens: dbAgent.memoryBudgetTokens,
          };
        }
      } catch {
        // Falls back to mock registry when DB is unavailable in early local setup.
      }
    }

    const fallback = this.fallbackAgents.get(agentId);
    if (!fallback) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    return fallback;
  }
}

export const agentRegistry = new AgentRegistry();
