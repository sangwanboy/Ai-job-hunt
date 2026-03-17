import { z } from "zod";
import { LLM_PROVIDERS } from "@/types/settings";

const providerEnum = z.enum(LLM_PROVIDERS);

export const llmProviderUpdateSchema = z.object({
  provider: providerEnum,
  apiKey: z.string().trim().min(8).optional(),
  clearApiKey: z.boolean().optional(),
  defaultModel: z.string().min(1),
  enabledModels: z.array(z.string().min(1)).min(1),
});

export const llmSettingsUpdateSchema = z.object({
  globalDefaultProvider: providerEnum,
  globalDefaultModel: z.string().min(1),
  providers: z.array(llmProviderUpdateSchema).min(1),
});
