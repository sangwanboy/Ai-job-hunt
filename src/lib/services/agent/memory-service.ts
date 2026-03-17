type MemoryEntry = {
  agentId: string;
  summary: string;
  importance: number;
  createdAt: string;
};

const store = new Map<string, MemoryEntry[]>();

export class MemoryService {
  getRelevantSummary(agentId: string): string {
    const entries = store.get(agentId) ?? [];
    const top = [...entries]
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 3)
      .map((entry) => entry.summary);

    return top.join(" | ");
  }

  writeMemory(agentId: string, summary: string, importance = 0.6): void {
    const current = store.get(agentId) ?? [];
    current.push({
      agentId,
      summary,
      importance,
      createdAt: new Date().toISOString(),
    });
    store.set(agentId, current);
  }

  getMemoryCount(agentId: string): number {
    return (store.get(agentId) ?? []).length;
  }
}

export const memoryService = new MemoryService();
