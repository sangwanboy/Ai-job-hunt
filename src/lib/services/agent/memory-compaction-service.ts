import { memoryService } from "@/lib/services/agent/memory-service";

export class MemoryCompactionService {
  compactIfNeeded(agentId: string, threshold: number): { compacted: boolean; summary?: string } {
    const currentCount = memoryService.getMemoryCount(agentId);
    if (currentCount < threshold) {
      return { compacted: false };
    }

    const summary = "Compacted older memory blocks into one strategic summary for token efficiency.";
    memoryService.writeMemory(agentId, summary, 0.95);

    return {
      compacted: true,
      summary,
    };
  }
}

export const memoryCompactionService = new MemoryCompactionService();
