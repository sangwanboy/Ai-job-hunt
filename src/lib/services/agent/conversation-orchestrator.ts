import { z } from "zod";
import type { MessageRole } from "@/lib/domain/enums";
import { agentStore } from "@/lib/services/agent/agent-store";
import { getAiProvider } from "@/lib/services/ai/provider";
import { continuitySyncService } from "@/lib/services/agent/continuity-sync-service";
import { env } from "@/lib/config/env";
import type { BrowserToolName } from "@/lib/services/browser/types/browser-types";
import { loopPreventionGuard } from "@/lib/services/agent/loop-prevention-guard";
import { onboardingManager } from "@/lib/services/agent/onboarding-manager";
import { composeAgentSystemPrompt } from "@/lib/services/agent/prompt-composer";
import { agentRegistry } from "@/lib/services/agent/registry";
import { tokenBudgetManager } from "@/lib/services/agent/token-budget-manager";
import type { AgentRuntimeContext, AgentRuntimeResponse } from "@/lib/services/agent/types";

const maxToolRounds = 4;

const toolIntentPattern = /(\bfind\b|\bsearch\b|\bjob\b|\bsave\b|\badd\b|\bcreate\b|\bnavigate\b|\bopen\b|\bclick\b|\bextract\b|\bbrowser\b)/i;

const toolDescriptors = [
  {
    name: "save_job",
    description: "Save a job to the user's Jobs list. Parameters: { title: string, company: string, location: string, salary?: string, url?: string, source?: string }",
    parameters: {
      title: "string",
      company: "string",
      location: "string",
      salary: "string?",
      url: "string?",
      source: "string?",
    },
  },
  {
    name: "browser_navigate",
    description: "Navigate to a URL. Parameters: { url: string, sessionId: string }",
    parameters: { url: "string", sessionId: "string" },
  },
  {
    name: "browser_click",
    description: "Click an element by selector. Parameters: { sessionId: string, selector: string }",
    parameters: { sessionId: "string", selector: "string" },
  },
  {
    name: "browser_extract_jobs",
    description: "Extract job listings from current page. Parameters: { sessionId: string, selector?: string }",
    parameters: { sessionId: "string", selector: "string?" },
  },
  {
    name: "browser_type",
    description: "Type text into a field. Parameters: { sessionId: string, selector: string, text: string, clearFirst?: boolean }",
    parameters: { sessionId: "string", selector: "string", text: "string", clearFirst: "boolean?" },
  },
  {
    name: "browser_screenshot",
    description: "Take a screenshot of the current page. Parameters: { sessionId: string, fileName?: string }",
    parameters: { sessionId: "string", fileName: "string?" },
  },
  {
    name: "browser_extract_text",
    description: "Extract text content from the page or a selector. Parameters: { sessionId: string, selector?: string, maxLength?: number }",
    parameters: { sessionId: "string", selector: "string?", maxLength: "number?" },
  },
] as const;

const browserToolNames = new Set<BrowserToolName>([
  "browser_create_session",
  "browser_open_session",
  "browser_open_page",
  "browser_navigate",
  "browser_click",
  "browser_type",
  "browser_scroll",
  "browser_screenshot",
  "browser_close_session",
  "browser_extract_text",
  "browser_extract_jobs",
]);

const saveJobToolSchema = z.object({
  title: z.string().min(1),
  company: z.string().min(1),
  location: z.string().min(1),
  salary: z.string().optional(),
  url: z.string().url().optional(),
  source: z.string().default("Agent Search"),
  status: z.string().optional(),
  priority: z.string().optional(),
});

type ToolCall = {
  tool: string;
  parameters: Record<string, unknown>;
};

function normalizeToolCallCandidate(candidate: Record<string, unknown>): ToolCall | null {
  if (typeof candidate.tool === "string" && candidate.parameters && typeof candidate.parameters === "object") {
    return {
      tool: candidate.tool,
      parameters: candidate.parameters as Record<string, unknown>,
    };
  }

  if (typeof candidate.name === "string") {
    const args = candidate.arguments;
    if (args && typeof args === "object") {
      return { tool: candidate.name, parameters: args as Record<string, unknown> };
    }
    if (typeof args === "string") {
      try {
        const parsedArgs = JSON.parse(args) as Record<string, unknown>;
        return { tool: candidate.name, parameters: parsedArgs };
      } catch {
        return null;
      }
    }
  }

  if (candidate.function_call && typeof candidate.function_call === "object") {
    const fn = candidate.function_call as Record<string, unknown>;
    if (typeof fn.name !== "string") {
      return null;
    }

    if (fn.arguments && typeof fn.arguments === "object") {
      return { tool: fn.name, parameters: fn.arguments as Record<string, unknown> };
    }

    if (typeof fn.arguments === "string") {
      try {
        const parsedArgs = JSON.parse(fn.arguments) as Record<string, unknown>;
        return { tool: fn.name, parameters: parsedArgs };
      } catch {
        return null;
      }
    }
  }

  if (Array.isArray(candidate.tool_calls) && candidate.tool_calls.length > 0) {
    const first = candidate.tool_calls[0];
    if (first && typeof first === "object") {
      const call = first as Record<string, unknown>;
      const fn = call.function;
      if (fn && typeof fn === "object") {
        const functionCall = fn as Record<string, unknown>;
        if (typeof functionCall.name === "string") {
          if (functionCall.arguments && typeof functionCall.arguments === "object") {
            return { tool: functionCall.name, parameters: functionCall.arguments as Record<string, unknown> };
          }
          if (typeof functionCall.arguments === "string") {
            try {
              const parsedArgs = JSON.parse(functionCall.arguments) as Record<string, unknown>;
              return { tool: functionCall.name, parameters: parsedArgs };
            } catch {
              return null;
            }
          }
        }
      }
    }
  }

  return null;
}

function getInternalApiBases(): string[] {
  return Array.from(
    new Set(
      ["http://127.0.0.1:3001", env.NEXT_PUBLIC_APP_URL, env.NEXTAUTH_URL, "http://127.0.0.1:3000"]
        .filter(Boolean),
    ),
  );
}

async function postInternalJson<TResponse extends Record<string, unknown>>(
  path: string,
  body: Record<string, unknown>,
): Promise<TResponse> {
  let lastError: Error | null = null;
  for (const base of getInternalApiBases()) {
    try {
      const url = new URL(path, base).toString();
      // console.log(`[Orchestrator] Posting to internal API: ${url}`);
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as TResponse | { error?: string };
      if (!response.ok) {
        const message = "error" in payload && typeof payload.error === "string"
          ? payload.error
          : `Request failed: ${response.status}`;
        throw new Error(message);
      }
      return payload as TResponse;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Unknown internal fetch error");
    }
  }
  throw lastError ?? new Error(`Unable to reach internal route: ${path}`);
}

function extractToolCalls(input: string): ToolCall[] {
  const candidates: string[] = [];
  const results: ToolCall[] = [];
  const mdMatches = Array.from(input.matchAll(/```json\s*([\s\S]*?)```/gi), (match) => match[1]);
  candidates.push(...mdMatches);

  let braceCount = 0;
  let currentBlock = "";
  let insideString = false;
  let escapeNext = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (escapeNext) { currentBlock += char; escapeNext = false; continue; }
    if (char === "\\") { currentBlock += char; escapeNext = true; continue; }
    if (char === '"') { insideString = !insideString; currentBlock += char; continue; }

    if (!insideString) {
      if (char === "{") { braceCount++; currentBlock += char; }
      else if (char === "}") {
        braceCount--;
        currentBlock += char;
        if (braceCount === 0 && currentBlock.includes("{")) {
          candidates.push(currentBlock);
          currentBlock = "";
        }
      } else if (braceCount > 0) { currentBlock += char; }
    } else { currentBlock += char; }
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      const normalized = normalizeToolCallCandidate(parsed);
      if (normalized) results.push(normalized);
    } catch { continue; }
  }
  return results;
}

function extractContinuityUpdate(input: string): any | null {
  const match = input.match(/<continuity_update>([\s\S]*?)<\/continuity_update>/i);
  if (!match) return null;
  try {
    return JSON.parse(match[1].trim());
  } catch {
    return null;
  }
}

function inferToolCallFromUserMessage(input: string): ToolCall | null {
  const text = input.trim();
  const savePattern = /save (this )?job\s*:?\s*(.+?)\s+at\s+(.+?)\s+in\s+(.+?)(?:,|$)/i;
  const saveMatch = text.match(savePattern);
  if (saveMatch) {
    return {
      tool: "save_job",
      parameters: {
        title: saveMatch[2].trim(),
        company: saveMatch[3].trim(),
        location: saveMatch[4].trim(),
        source: "Agent Chat",
      },
    };
  }
  return null;
}

async function executeToolCall(toolCall: ToolCall): Promise<string> {
  if (toolCall.tool === "save_job") {
    const params = saveJobToolSchema.parse(toolCall.parameters);
    const payload = await postInternalJson<{ success: boolean; job: { id: string; title: string; company: string } }>("/api/jobs", params);
    return `I've added ${payload.job.title} at ${payload.job.company} to your Jobs list.`;
  }
  if (browserToolNames.has(toolCall.tool as BrowserToolName)) {
    const payload = await postInternalJson<Record<string, unknown>>("/api/browser", {
      action: toolCall.tool.replace("browser_", ""),
      sessionId: toolCall.parameters.sessionId || "default-session",
      params: toolCall.parameters,
    });
    return JSON.stringify(payload, null, 2);
  }
  throw new Error(`Unsupported tool requested by model: ${toolCall.tool}`);
}

function normalizeAgentReply(input: string): string {
  let text = input.trim();
  // Strip continuity update block
  text = text.replace(/<continuity_update>[\s\S]*?<\/continuity_update>/gi, "");
  text = text.trim();
  
  text = text.replace(/^(acknowledged|understood|got it|certainly|absolutely|great question|thanks for clarifying)[\s,.:;-]+/i, "");
  text = text.replace(/\*\*(.*?)\*\*/g, "$1");
  text = text.replace(/^#{1,6}\s+/gm, "");
  return text.trim();
}

export class ConversationOrchestrator {
  async run(context: AgentRuntimeContext): Promise<AgentRuntimeResponse> {
    const agent = await agentRegistry.getAgent(context.agentId, context.userId);
    const effectiveUserId = context.userId ?? agent.userId;
    
    // 1. Resolve Session early to avoid "default" vs "real-id" naming split
    let effectiveSessionId = context.sessionId;
    if (effectiveUserId) {
      try {
        effectiveSessionId = await agentStore.createOrReuseSession({ 
          sessionId: context.sessionId, 
          userId: effectiveUserId, 
          agentId: agent.id, 
          message: context.message 
        });
      } catch (err) {
        console.warn("Failed to resolve session ID early, using provided:", context.sessionId);
      }
    }
    const sid = effectiveSessionId || "default";

    // 2. Primer: If this is a reloaded session and continuity state is empty, warm it up FROM DB
    const state = continuitySyncService.getContinuityState(agent.id, sid);
    if (state.history.recentTurns.length === 0 && sid !== "new" && sid !== "default") {
      try {
        const historyMessages = await agentStore.getSessionMessages(sid);
        if (historyMessages.length > 0) {
          // Add historical turns so getFormattedHistory works
          for (const msg of historyMessages.slice(-10)) {
            continuitySyncService.addHistoryTurn(agent.id, sid, msg.role, msg.content);
          }
        }
      } catch (err) {
        console.error("Failed to warm up session continuity:", err);
      }
    }

    // Capture history BEFORE adding the current message to avoid prompt redundancy
    const historyContext = continuitySyncService.getFormattedHistory(agent.id, sid);

    continuitySyncService.recordActivity(agent.id, sid);
    const { rehydrated } = await continuitySyncService.checkIdleRehydration(agent.id, sid);
    
    // Add current user turn to state (for future turns)
    continuitySyncService.addHistoryTurn(agent.id, sid, "USER", context.message);

    // 3. Onboarding
    let onboardingComplete = onboardingManager.isComplete(agent.id, agent.onboardingCompleted, effectiveUserId);
    if (!onboardingComplete && toolIntentPattern.test(context.message)) {
      await onboardingManager.handleConversation({ ...context, message: "skip onboarding" }, effectiveUserId);
      onboardingComplete = true;
    }

    if (!onboardingComplete) {
      const onboardingResponse = await onboardingManager.handleConversation({ ...context, agentId: agent.id }, effectiveUserId);
      if (effectiveUserId) {
        try {
          await agentStore.saveMessage({ sessionId: sid, role: "USER", content: context.message, tokenEstimate: Math.ceil(context.message.length / 4), agentId: agent.id, userId: effectiveUserId });
          await agentStore.saveMessage({ sessionId: sid, role: "ASSISTANT", content: onboardingResponse.reply, tokenEstimate: Math.ceil(onboardingResponse.reply.length / 4), agentId: agent.id, userId: effectiveUserId });
          continuitySyncService.addHistoryTurn(agent.id, sid, "ASSISTANT", onboardingResponse.reply);
          await continuitySyncService.syncPostStep(agent.id, sid, "Onboarding step", [], { currentTaskState: "ready" });
        } catch {}
      }
      return { reply: onboardingResponse.reply, shouldWriteSummary: onboardingResponse.completed, loopPrevented: false, onboardingCompleted: onboardingResponse.completed, sessionId: effectiveSessionId, profileSnapshot: onboardingResponse.profileSnapshot, continuitySynced: true, rehydrated };
    }

    const loopCheck = loopPreventionGuard.checkMessage(context.agentId, context.message, context.sessionId);
    if (loopCheck.blocked) {
      return { reply: loopCheck.reason ?? "Loop prevented.", shouldWriteSummary: false, loopPrevented: true, sessionId: effectiveSessionId, continuitySynced: false, rehydrated };
    }

    const budget = tokenBudgetManager.checkResponseBudget({ message: context.message, budget: agent.responseBudgetTokens });
    const systemPrompt = composeAgentSystemPrompt(agent, "none");

    await continuitySyncService.syncPreStep(agent.id, sid, "Starting chain");
    const provider = getAiProvider(context.preferredProvider);
    let aiResponseText = "";
    let toolContext = "";
    const toolLogs: Array<{ tool: string; parameters: any; result: string }> = [];

    // Clean up historyContext string if it's the "No history" default
    const formattedHistory = (historyContext && historyContext !== "No history yet.") ? historyContext : null;

    for (let round = 0; round < maxToolRounds && !aiResponseText; round++) {
      const aiResponse = await provider.chat({
        systemPrompt,
        userPrompt: [
          formattedHistory ? `Previous conversation history:\n${formattedHistory}` : null,
          `User request: ${context.message}`,
          toolContext ? `Tool results:\n${toolContext}` : null,
          round > 0 ? "Review tools. If goal met, respond. If not, next tools." : null
        ].filter(Boolean).join("\n\n"),
        model: context.preferredModel ?? agent.model,
        temperature: 0.4,
        apiKey: context.apiKey,
      });

      if (aiResponse.text.includes("failed:") || aiResponse.text.includes("API key missing")) { aiResponseText = aiResponse.text; break; }
      const toolCalls = extractToolCalls(aiResponse.text);
      if (toolCalls.length === 0 && round === 0) { const inf = inferToolCallFromUserMessage(context.message); if (inf) toolCalls.push(inf); }
      if (toolCalls.length === 0) { aiResponseText = aiResponse.text; break; }

      let turnRes = "";
      for (const call of toolCalls) {
        try {
          const res = await executeToolCall(call);
          toolLogs.push({ tool: call.tool, parameters: call.parameters, result: res });
          turnRes += `\nTool: ${call.tool}\nResult: ${res}\n`;
          continuitySyncService.recordToolResult(agent.id, sid, `${call.tool}: ${res.slice(0, 300)}`);
        } catch (e) { turnRes += `\nTool: ${call.tool}\nResult: Failed\n`; }
      }
      toolContext = (toolContext + "\n" + turnRes).trim();
    }

    if (!aiResponseText && toolLogs.length > 0) aiResponseText = toolLogs[toolLogs.length - 1].result;
    const isError = aiResponseText.includes("failed:") || aiResponseText.includes("API key missing");
    let normalizedReply = normalizeAgentReply(aiResponseText);

    if (effectiveUserId) {
      try {
        await agentStore.saveMessage({ sessionId: sid, role: "USER", content: context.message, tokenEstimate: Math.ceil(context.message.length / 4), agentId: agent.id, userId: effectiveUserId });
        await agentStore.saveMessage({ sessionId: sid, role: "ASSISTANT", content: normalizedReply, tokenEstimate: Math.ceil(normalizedReply.length / 4), agentId: agent.id, userId: effectiveUserId });
      } catch {}
    }

    continuitySyncService.addHistoryTurn(agent.id, sid, "ASSISTANT", normalizedReply);
    
    // Extract and apply LLM-driven continuity updates
    const continuityUpdate = extractContinuityUpdate(aiResponseText);
    if (continuityUpdate) {
      await continuitySyncService.syncLayersWithLlm(agent.id, sid, continuityUpdate);
    }

    await continuitySyncService.syncPostStep(agent.id, sid, "Generated", [], { currentTaskState: "ready" });

    return { reply: normalizedReply, shouldWriteSummary: true, loopPrevented: false, tokenBudgetWarning: budget.warning, sessionId: effectiveSessionId, onboardingCompleted: true, continuitySynced: true, rehydrated, toolLogs };
  }
}

export const conversationOrchestrator = new ConversationOrchestrator();
