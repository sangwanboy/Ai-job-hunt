import { env } from "@/lib/config/env";

export type AiProviderName = "openai" | "anthropic" | "gemini" | "groq" | "mistral" | "cohere" | "perplexity" | "xai" | "deepseek" | "together" | "openrouter";

export type AiChatRequest = {
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  temperature?: number;
  apiKey?: string;
};

export type AiChatResponse = {
  text: string;
  provider: AiProviderName;
  model: string;
};

export interface AiProvider {
  chat(request: AiChatRequest): Promise<AiChatResponse>;
}

class MockAiProvider implements AiProvider {
  constructor(private readonly providerName: AiProviderName) {}

  async chat(request: AiChatRequest): Promise<AiChatResponse> {
    const response = `${request.userPrompt}\n\n[Mock ${this.providerName} response generated for v1 scaffold.]`;
    return {
      text: response,
      provider: this.providerName,
      model: request.model ?? env.DEFAULT_AI_MODEL,
    };
  }
}

type GeminiCandidate = {
  content?: {
    parts?: Array<{ text?: string }>;
  };
};

type GeminiResponse = {
  candidates?: GeminiCandidate[];
};

class GeminiApiProvider implements AiProvider {
  async chat(request: AiChatRequest): Promise<AiChatResponse> {
    const apiKey = request.apiKey || env.GEMINI_API_KEY;
    const model = request.model ?? "gemini-3.1-flash-lite-preview";

    if (!apiKey) {
      const fallback = await new MockAiProvider("gemini").chat(request);
      return {
        ...fallback,
        text: `${fallback.text}\n[Gemini API key missing, using mock response.]`,
      };
    }

    let lastResponse: Response | null = null;
    let attempts = 0;
    const maxAttempts = 4;

    while (attempts < maxAttempts) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: `${request.systemPrompt}\n\nUser: ${request.userPrompt}`,
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: request.temperature ?? 0.4,
            },
          }),
        },
      );

      if (response.ok) {
        const json = (await response.json()) as GeminiResponse;
        const text = json.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join(" ").trim();

        return {
          text: text || "I received an empty response from Gemini.",
          provider: "gemini",
          model,
        };
      }

      lastResponse = response;
      if (response.status === 429 && attempts < maxAttempts - 1) {
        // Exponential backoff: base * 2^attempts + jitter
        const delay = Math.pow(2, attempts) * 3000 + Math.random() * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
        attempts += 1;
        continue;
      }
      break;
    }

    const errorText = await lastResponse!.text();
    return {
      text: `Gemini request failed: ${lastResponse!.status}. ${errorText.slice(0, 300)}`,
      provider: "gemini",
      model,
    };
  }
}

const providers: Record<AiProviderName, AiProvider> = {
  openai: new MockAiProvider("openai"),
  anthropic: new MockAiProvider("anthropic"),
  gemini: new GeminiApiProvider(),
  groq: new MockAiProvider("groq"),
  mistral: new MockAiProvider("mistral"),
  cohere: new MockAiProvider("cohere"),
  perplexity: new MockAiProvider("perplexity"),
  xai: new MockAiProvider("xai"),
  deepseek: new MockAiProvider("deepseek"),
  together: new MockAiProvider("together"),
  openrouter: new MockAiProvider("openrouter"),
};

export function getAiProvider(name?: AiProviderName): AiProvider {
  return providers[name ?? env.DEFAULT_AI_PROVIDER];
}
