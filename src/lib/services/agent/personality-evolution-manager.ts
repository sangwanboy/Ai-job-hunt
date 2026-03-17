type PersonalityState = {
  conciseness: number;
  strategyDepth: number;
  warmth: number;
};

const stateStore = new Map<string, PersonalityState>();

export class PersonalityEvolutionManager {
  getState(agentId: string): PersonalityState {
    return (
      stateStore.get(agentId) ?? {
        conciseness: 0.65,
        strategyDepth: 0.66,
        warmth: 0.5,
      }
    );
  }

  applyEvidence(agentId: string, evidence: { concisePreferred?: boolean; strategicPreferred?: boolean }) {
    const current = this.getState(agentId);
    const next = { ...current };

    if (evidence.concisePreferred) {
      next.conciseness = Math.min(0.9, current.conciseness + 0.02);
    }
    if (evidence.strategicPreferred) {
      next.strategyDepth = Math.min(0.9, current.strategyDepth + 0.02);
    }

    stateStore.set(agentId, next);
    return next;
  }

  reset(agentId: string) {
    stateStore.delete(agentId);
  }
}

export const personalityEvolutionManager = new PersonalityEvolutionManager();
