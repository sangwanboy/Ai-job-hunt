import { existsSync, readFileSync } from "fs";
import { writeFile } from "fs/promises";
import { join } from "path";
import { llmProviderCatalog } from "@/lib/services/settings/llm-catalog";
import type {
  LlmProvider,
  RuntimeSettingsResponse,
  RuntimeSettingsUpdatePayload,
  TokenUsageSummary,
} from "@/types/settings";

type ProviderUsageRuntime = {
  requests: number;
  promptTokens: number;
  completionTokens: number;
};

type RuntimeState = {
  monthlyTokenBudget: number;
  softLimitPercent: number;
  perResponseTokenCap: number;
  autoSummarizeOnHighUsage: boolean;
  strictLoopProtection: boolean;
  strictAgentResponseMode: boolean;
  allowProviderFallback: boolean;
  redactPiiInMemory: boolean;
  usagePeriodStart: string;
  usageByProvider: Record<LlmProvider, ProviderUsageRuntime>;
  updatedAt: string;
};

const globalStore = globalThis as unknown as {
  runtimeSettingsStore?: Map<string, RuntimeState>;
};

const store = globalStore.runtimeSettingsStore ?? new Map<string, RuntimeState>();
globalStore.runtimeSettingsStore = store;

const runtimePersistPath = join(process.cwd(), ".runtime-settings.local.json");

function persistStore(): void {
  const payload = JSON.stringify(Object.fromEntries(store.entries()), null, 2);
  void writeFile(runtimePersistPath, payload, "utf-8").catch(() => {
    // Non-blocking persistence for local runtime metrics/settings.
  });
}

function hydrateStoreFromDisk(): void {
  if (store.size > 0) {
    return;
  }

  try {
    if (!existsSync(runtimePersistPath)) {
      return;
    }

    const raw = readFileSync(runtimePersistPath, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, RuntimeState>;
    for (const [userId, state] of Object.entries(parsed)) {
      store.set(userId, state);
    }
  } catch {
    // Fall back to in-memory defaults when local persisted file is invalid/unavailable.
  }
}

function createDefaultState(): RuntimeState {
  const usageByProvider = Object.fromEntries(
    llmProviderCatalog.map((provider) => [
      provider.provider,
      {
        requests: 0,
        promptTokens: 0,
        completionTokens: 0,
      },
    ]),
  ) as Record<LlmProvider, ProviderUsageRuntime>;

  return {
    monthlyTokenBudget: 1_000_000,
    softLimitPercent: 85,
    perResponseTokenCap: 8_192,
    autoSummarizeOnHighUsage: true,
    strictLoopProtection: true,
    strictAgentResponseMode: true,
    allowProviderFallback: true,
    redactPiiInMemory: true,
    usagePeriodStart: new Date().toISOString(),
    usageByProvider,
    updatedAt: new Date().toISOString(),
  };
}

function resolveState(userId: string): RuntimeState {
  hydrateStoreFromDisk();

  const existing = store.get(userId);
  if (existing) {
    if (existing.strictAgentResponseMode === undefined) {
      existing.strictAgentResponseMode = true;
      existing.updatedAt = new Date().toISOString();
      store.set(userId, existing);
    }
    return existing;
  }

  const seeded = createDefaultState();
  store.set(userId, seeded);
  persistStore();
  return seeded;
}

function toUsageSummary(state: RuntimeState): TokenUsageSummary {
  const byProvider = llmProviderCatalog.map((provider) => {
    const usage = state.usageByProvider[provider.provider];
    return {
      provider: provider.provider,
      requests: usage.requests,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.promptTokens + usage.completionTokens,
    };
  });

  const requests = byProvider.reduce((sum, item) => sum + item.requests, 0);
  const promptTokens = byProvider.reduce((sum, item) => sum + item.promptTokens, 0);
  const completionTokens = byProvider.reduce((sum, item) => sum + item.completionTokens, 0);

  return {
    requests,
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    periodStart: state.usagePeriodStart,
    periodEnd: new Date().toISOString(),
    byProvider,
  };
}

function toResponse(state: RuntimeState): RuntimeSettingsResponse {
  return {
    settings: {
      monthlyTokenBudget: state.monthlyTokenBudget,
      softLimitPercent: state.softLimitPercent,
      perResponseTokenCap: state.perResponseTokenCap,
      autoSummarizeOnHighUsage: state.autoSummarizeOnHighUsage,
      strictLoopProtection: state.strictLoopProtection,
      strictAgentResponseMode: state.strictAgentResponseMode ?? true,
      allowProviderFallback: state.allowProviderFallback,
      redactPiiInMemory: state.redactPiiInMemory,
    },
    usage: toUsageSummary(state),
    updatedAt: state.updatedAt,
  };
}

export class RuntimeSettingsStore {
  get(userId = "local-dev-user"): RuntimeSettingsResponse {
    return toResponse(resolveState(userId));
  }

  update(payload: RuntimeSettingsUpdatePayload, userId = "local-dev-user"): RuntimeSettingsResponse {
    const state = resolveState(userId);

    state.monthlyTokenBudget = payload.monthlyTokenBudget;
    state.softLimitPercent = payload.softLimitPercent;
    state.perResponseTokenCap = payload.perResponseTokenCap;
    state.autoSummarizeOnHighUsage = payload.autoSummarizeOnHighUsage;
    state.strictLoopProtection = payload.strictLoopProtection;
    state.strictAgentResponseMode = payload.strictAgentResponseMode;
    state.allowProviderFallback = payload.allowProviderFallback;
    state.redactPiiInMemory = payload.redactPiiInMemory;
    state.updatedAt = new Date().toISOString();

    store.set(userId, state);
    persistStore();
    return toResponse(state);
  }

  trackUsage(
    input: { provider: LlmProvider; promptTokens: number; completionTokens: number },
    userId = "local-dev-user",
  ) {
    const state = resolveState(userId);
    const providerUsage = state.usageByProvider[input.provider];

    providerUsage.requests += 1;
    providerUsage.promptTokens += Math.max(0, Math.floor(input.promptTokens));
    providerUsage.completionTokens += Math.max(0, Math.floor(input.completionTokens));
    state.updatedAt = new Date().toISOString();

    store.set(userId, state);
    persistStore();
  }
}

export const runtimeSettingsStore = new RuntimeSettingsStore();
