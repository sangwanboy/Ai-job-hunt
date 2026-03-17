import type { LlmProvider } from "@/types/settings";

type LlmProviderCatalogEntry = {
  provider: LlmProvider;
  label: string;
  models: string[];
  defaultModel: string;
};

export const llmProviderCatalog: LlmProviderCatalogEntry[] = [
  {
    provider: "openai",
    label: "OpenAI",
    models: ["gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano", "gpt-4o", "gpt-4o-mini", "o3", "o3-mini", "o1"],
    defaultModel: "gpt-4.1",
  },
  {
    provider: "anthropic",
    label: "Anthropic",
    models: ["claude-3-7-sonnet", "claude-3-5-sonnet", "claude-3-5-haiku", "claude-3-opus"],
    defaultModel: "claude-3-7-sonnet",
  },
  {
    provider: "gemini",
    label: "Google Gemini",
    models: [
      "gemini-2.5-flash",
      "gemini-2.5-pro",
      "gemini-2.0-flash",
      "gemini-2.0-flash-lite",
      "gemini-3.1-pro-preview",
      "gemini-3.1-flash-lite-preview",
      "gemini-1.5-pro",
      "gemini-1.5-flash",
    ],
    defaultModel: "gemini-3.1-flash-lite-preview",
  },
  {
    provider: "groq",
    label: "Groq",
    models: [
      "llama-3.3-70b-versatile",
      "deepseek-r1-distill-llama-70b",
      "llama-3.1-70b-versatile",
      "mixtral-8x7b-32768",
      "gemma2-9b-it",
    ],
    defaultModel: "llama-3.3-70b-versatile",
  },
  {
    provider: "mistral",
    label: "Mistral",
    models: [
      "mistral-large-latest",
      "mistral-small-latest",
      "codestral-latest",
      "pixtral-large-latest",
      "ministral-8b-latest",
    ],
    defaultModel: "mistral-large-latest",
  },
  {
    provider: "cohere",
    label: "Cohere",
    models: ["command-r-plus-08-2024", "command-r-08-2024", "command-r-plus", "command-r"],
    defaultModel: "command-r-plus-08-2024",
  },
  {
    provider: "perplexity",
    label: "Perplexity",
    models: ["sonar-pro", "sonar", "sonar-reasoning", "sonar-large-online", "sonar-small-online"],
    defaultModel: "sonar-pro",
  },
  {
    provider: "xai",
    label: "xAI",
    models: ["grok-2-1212", "grok-2-vision-1212", "grok-2-latest", "grok-beta"],
    defaultModel: "grok-2-1212",
  },
  {
    provider: "deepseek",
    label: "DeepSeek",
    models: ["deepseek-chat", "deepseek-reasoner", "deepseek-v3", "deepseek-r1"],
    defaultModel: "deepseek-chat",
  },
  {
    provider: "together",
    label: "Together AI",
    models: [
      "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
      "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
      "Qwen/Qwen2.5-72B-Instruct-Turbo",
      "deepseek-ai/DeepSeek-V3",
      "deepseek-ai/DeepSeek-R1",
    ],
    defaultModel: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
  },
  {
    provider: "openrouter",
    label: "OpenRouter",
    models: [
      "openai/gpt-4.1",
      "openai/o3",
      "anthropic/claude-3.7-sonnet",
      "google/gemini-2.0-flash-001",
      "x-ai/grok-2-1212",
      "deepseek/deepseek-r1",
      "meta-llama/llama-3.1-70b-instruct",
    ],
    defaultModel: "openai/gpt-4.1",
  },
];

export function getProviderCatalog(provider: LlmProvider) {
  const found = llmProviderCatalog.find((entry) => entry.provider === provider);
  if (!found) {
    throw new Error(`Unknown provider catalog: ${provider}`);
  }
  return found;
}
