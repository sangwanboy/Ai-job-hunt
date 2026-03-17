export const LLM_PROVIDERS = [
  "openai",
  "anthropic",
  "gemini",
  "groq",
  "mistral",
  "cohere",
  "perplexity",
  "xai",
  "deepseek",
  "together",
  "openrouter",
] as const;

export type LlmProvider = (typeof LLM_PROVIDERS)[number];

export type ProviderSettings = {
  provider: LlmProvider;
  label: string;
  hasApiKey: boolean;
  apiKeyMasked: string | null;
  defaultModel: string;
  enabledModels: string[];
  availableModels: string[];
};

export type LlmSettingsResponse = {
  globalDefaultProvider: LlmProvider;
  globalDefaultModel: string;
  providers: ProviderSettings[];
  updatedAt: string;
};

export type LlmProviderUpdatePayload = {
  provider: LlmProvider;
  apiKey?: string;
  clearApiKey?: boolean;
  defaultModel: string;
  enabledModels: string[];
};

export type LlmSettingsUpdatePayload = {
  globalDefaultProvider: LlmProvider;
  globalDefaultModel: string;
  providers: LlmProviderUpdatePayload[];
};

export type ProviderTokenUsage = {
  provider: LlmProvider;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type TokenUsageSummary = {
  requests: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  periodStart: string;
  periodEnd: string;
  byProvider: ProviderTokenUsage[];
};

export type RuntimeSettings = {
  monthlyTokenBudget: number;
  softLimitPercent: number;
  perResponseTokenCap: number;
  autoSummarizeOnHighUsage: boolean;
  strictLoopProtection: boolean;
  strictAgentResponseMode: boolean;
  allowProviderFallback: boolean;
  redactPiiInMemory: boolean;
};

export type RuntimeSettingsResponse = {
  settings: RuntimeSettings;
  usage: TokenUsageSummary;
  updatedAt: string;
};

export type RuntimeSettingsUpdatePayload = RuntimeSettings;
