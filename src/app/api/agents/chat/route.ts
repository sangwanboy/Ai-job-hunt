import { NextResponse } from "next/server";
import { conversationOrchestrator } from "@/lib/services/agent/conversation-orchestrator";
import { tokenBudgetManager } from "@/lib/services/agent/token-budget-manager";
import { llmSettingsStore } from "@/lib/services/settings/llm-settings-store";
import { runtimeSettingsStore } from "@/lib/services/settings/runtime-settings-store";
import { chatRequestSchema } from "@/lib/utils/validation";

export async function POST(request: Request) {
  try {
    const json = (await request.json()) as Record<string, unknown>;

    const parsed = chatRequestSchema.parse({
      agentId: json.agentId,
      sessionId: json.sessionId,
      message: json.message,
      context: json.context,
    });

    const userId = typeof json.userId === "string" ? json.userId : undefined;
    const settingsUserId = userId ?? "local-dev-user";
    const runtimeSettings = runtimeSettingsStore.get(settingsUserId).settings;
    const selection = llmSettingsStore.getRuntimeSelection(settingsUserId);
    const geminiKey = llmSettingsStore.getProviderApiKey("gemini", settingsUserId);
    const requestedProvider = selection.provider || "gemini";
    const selectedProvider = selection.apiKey ? requestedProvider : (geminiKey ? "gemini" : requestedProvider);
    const selectedApiKey = selectedProvider === "gemini" ? geminiKey ?? selection.apiKey : selection.apiKey;

    const result = await conversationOrchestrator.run({
      agentId: parsed.agentId,
      sessionId: parsed.sessionId,
      userId,
      message: parsed.message,
      preferredProvider: selectedProvider,
      preferredModel: selection.model,
      apiKey: selectedApiKey ?? undefined,
      strictAgentResponseMode: runtimeSettings.strictAgentResponseMode,
    });

    const promptTokens = tokenBudgetManager.estimateTokens(parsed.message);
    const completionTokens = tokenBudgetManager.estimateTokens(result.reply);
    const provider = selectedProvider;

    runtimeSettingsStore.trackUsage({
      provider,
      promptTokens,
      completionTokens,
    }, settingsUserId);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected chat error";
    return NextResponse.json(
      {
        error: message,
      },
      { status: 400 },
    );
  }
}
