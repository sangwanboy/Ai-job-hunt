type LoopState = {
  recentMessages: string[];
  repeatedCount: number;
  lastToolSignature?: string;
  lastActionAt?: number;
};

const globalLoopState = globalThis as unknown as {
  loopStoreMap?: Map<string, LoopState>;
};

const loopStore = globalLoopState.loopStoreMap ?? new Map<string, LoopState>();
globalLoopState.loopStoreMap = loopStore;

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

export class LoopPreventionGuard {
  checkMessage(agentId: string, message: string, sessionId?: string): { blocked: boolean; reason?: string } {
    const key = `${agentId}:${sessionId ?? "default"}`;
    const state = loopStore.get(key) ?? { recentMessages: [], repeatedCount: 0 };
    const normalized = normalize(message);
    const exists = state.recentMessages.includes(normalized);

    if (exists) {
      state.repeatedCount += 1;
    } else {
      state.repeatedCount = 0;
    }

    state.recentMessages = [...state.recentMessages.slice(-4), normalized];
    loopStore.set(key, state);

    if (state.repeatedCount >= 2) {
      return {
        blocked: true,
        reason: "Repeated request detected. Switching to summary response to prevent loops.",
      };
    }

    return { blocked: false };
  }
}

export const loopPreventionGuard = new LoopPreventionGuard();
