import * as fs from "fs/promises";
import * as path from "path";
import { llmProviderCatalog } from "@/lib/services/settings/llm-catalog";
import type {
  LlmProvider,
  LlmProviderUpdatePayload,
  LlmSettingsResponse,
  LlmSettingsUpdatePayload,
  ProviderSettings,
} from "@/types/settings";

type ProviderRuntimeState = {
  apiKey: string | null;
  defaultModel: string;
  enabledModels: string[];
};

type UserLlmState = {
  globalDefaultProvider: LlmProvider;
  globalDefaultModel: string;
  providers: Record<LlmProvider, ProviderRuntimeState>;
  updatedAt: string;
};

export type RuntimeLlmSelection = {
  provider: LlmProvider;
  model: string;
  apiKey: string | null;
};

const globalStore = globalThis as unknown as {
  llmSettingsStore?: Map<string, UserLlmState>;
};

const store = globalStore.llmSettingsStore ?? new Map<string, UserLlmState>();
globalStore.llmSettingsStore = store;

const providerEnvVarMap: Record<LlmProvider, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
  groq: "GROQ_API_KEY",
  mistral: "MISTRAL_API_KEY",
  cohere: "COHERE_API_KEY",
  perplexity: "PERPLEXITY_API_KEY",
  xai: "XAI_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  together: "TOGETHER_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

function maskApiKey(value: string): string {
  if (value.length <= 8) {
    return "*".repeat(value.length);
  }
  return `${value.slice(0, 4)}${"*".repeat(Math.max(4, value.length - 8))}${value.slice(-4)}`;
}

function defaultState(): UserLlmState {
  const providers = Object.fromEntries(
    llmProviderCatalog.map((entry) => [
      entry.provider,
      {
        apiKey: process.env[providerEnvVarMap[entry.provider]]?.trim() || null,
        defaultModel: entry.defaultModel,
        enabledModels: [entry.defaultModel],
      },
    ]),
  ) as Record<LlmProvider, ProviderRuntimeState>;

  const defaultProvider = (process.env.DEFAULT_AI_PROVIDER as LlmProvider) || "gemini";
  const providerCatalog = llmProviderCatalog.find((e) => e.provider === defaultProvider) || llmProviderCatalog[0];

  return {
    globalDefaultProvider: defaultProvider,
    globalDefaultModel: process.env.DEFAULT_AI_MODEL || providerCatalog.defaultModel,
    providers,
    updatedAt: new Date().toISOString(),
  };
}

async function persistApiKeyToEnvLocal(provider: LlmProvider, apiKey: string | null): Promise<void> {
  const envVarName = providerEnvVarMap[provider];
  const envLocalPath = path.join(process.cwd(), ".env.local");
  const comment = "# Keys are written to .env.local for persistence across restarts. Never commit .env.local to git.";

  let content = "";
  try {
    content = await fs.readFile(envLocalPath, "utf-8");
  } catch {
    content = `${comment}\n`;
  }

  if (!content.includes(comment)) {
    content = `${comment}\n${content}`;
  }

  const line = `${envVarName}=${apiKey ?? ""}`;
  const pattern = new RegExp(`^${envVarName}=.*$`, "m");
  const nextContent = pattern.test(content)
    ? content.replace(pattern, line)
    : `${content.trimEnd()}\n${line}\n`;

  await fs.writeFile(envLocalPath, nextContent, "utf-8");
}

function resolveState(userId: string): UserLlmState {
  const existing = store.get(userId);
  if (existing) {
    return existing;
  }

  const seeded = defaultState();
  store.set(userId, seeded);
  return seeded;
}

function toResponse(state: UserLlmState): LlmSettingsResponse {
  const providers: ProviderSettings[] = llmProviderCatalog.map((entry) => {
    const runtime = state.providers[entry.provider];
    return {
      provider: entry.provider,
      label: entry.label,
      hasApiKey: Boolean(runtime.apiKey),
      apiKeyMasked: runtime.apiKey ? maskApiKey(runtime.apiKey) : null,
      defaultModel: runtime.defaultModel,
      enabledModels: runtime.enabledModels,
      availableModels: entry.models,
    };
  });

  return {
    globalDefaultProvider: state.globalDefaultProvider,
    globalDefaultModel: state.globalDefaultModel,
    providers,
    updatedAt: state.updatedAt,
  };
}

export class LlmSettingsStore {
  get(userId = "local-dev-user"): LlmSettingsResponse {
    const state = resolveState(userId);
    return toResponse(state);
  }

  async update(payload: LlmSettingsUpdatePayload, userId = "local-dev-user"): Promise<LlmSettingsResponse> {
    const state = resolveState(userId);

    for (const update of payload.providers) {
      await this.applyProviderUpdate(state, update);
    }

    state.globalDefaultProvider = payload.globalDefaultProvider;
    state.globalDefaultModel = payload.globalDefaultModel;
    state.updatedAt = new Date().toISOString();

    store.set(userId, state);
    return toResponse(state);
  }

  getRuntimeSelection(userId = "local-dev-user"): RuntimeLlmSelection {
    const state = resolveState(userId);
    const provider = state.globalDefaultProvider;
    const providerState = state.providers[provider];

    return {
      provider,
      model: state.globalDefaultModel || providerState.defaultModel,
      apiKey: providerState.apiKey,
    };
  }

  getProviderApiKey(provider: LlmProvider, userId = "local-dev-user"): string | null {
    const state = resolveState(userId);
    return state.providers[provider].apiKey;
  }

  private async applyProviderUpdate(state: UserLlmState, update: LlmProviderUpdatePayload) {
    const provider = state.providers[update.provider];

    if (update.clearApiKey) {
      provider.apiKey = null;
      await persistApiKeyToEnvLocal(update.provider, null);
    } else if (update.apiKey && update.apiKey.trim().length > 0) {
      provider.apiKey = update.apiKey.trim();
      await persistApiKeyToEnvLocal(update.provider, provider.apiKey);
    }

    provider.defaultModel = update.defaultModel;
    provider.enabledModels = Array.from(new Set(update.enabledModels));
  }
}

export const llmSettingsStore = new LlmSettingsStore();
