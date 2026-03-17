import { z } from "zod";
import type { MemoryKind, MessageRole } from "@/lib/domain/enums";
import { agentStore } from "@/lib/services/agent/agent-store";
import { getAiProvider } from "@/lib/services/ai/provider";
import { continuitySyncService } from "@/lib/services/agent/continuity-sync-service";
import { env } from "@/lib/config/env";
import type { BrowserToolName } from "@/lib/services/browser/types/browser-types";
import { loopPreventionGuard } from "@/lib/services/agent/loop-prevention-guard";
import { memoryCompactionService } from "@/lib/services/agent/memory-compaction-service";
import { onboardingManager } from "@/lib/services/agent/onboarding-manager";
import { personalityEvolutionManager } from "@/lib/services/agent/personality-evolution-manager";
import { composeAgentSystemPrompt } from "@/lib/services/agent/prompt-composer";
import { agentRegistry } from "@/lib/services/agent/registry";
import { tokenBudgetManager } from "@/lib/services/agent/token-budget-manager";
import type { JobSearchResult } from "@/lib/services/jobs/job-search-tool";
import type { AgentRuntimeContext, AgentRuntimeResponse } from "@/lib/services/agent/types";

const maxToolRounds = 2;

const toolIntentPattern = /(\bfind\b|\bsearch\b|\bjob\b|\bsave\b|\badd\b|\bcreate\b|\bnavigate\b|\bopen\b|\bclick\b|\bextract\b|\bbrowser\b)/i;

const toolDescriptors = [
  {
    name: "job_search",
    description: "Search real live job listings",
    parameters: { keywords: "string", location: "string" },
  },
  {
    name: "create_job",
    description: "Save a job to the user's Jobs list in this app",
    parameters: {
      title: "string",
      company: "string",
      location: "string",
      salary: "string?",
      url: "string?",
      source: "string?",
    },
  },
] as const;

const browserToolNames = new Set<BrowserToolName>([
  "browser_launch_browser",
  "browser_create_session",
  "browser_open_session",
  "browser_open_page",
  "browser_navigate",
  "browser_click",
  "browser_type",
  "browser_scroll",
  "browser_extract_text",
  "browser_screenshot",
  "browser_close_session",
]);

const jobSearchToolSchema = z.object({
  keywords: z.string().min(1),
  location: z.string().min(1),
  resultsPerPage: z.number().int().min(1).max(20).optional(),
});

const createJobToolSchema = z.object({
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

type BrowserToolRouteResult = {
  status?: string;
  sessionId?: string;
  data?: Record<string, unknown>;
  error?: { message?: string };
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
      [env.NEXT_PUBLIC_APP_URL, env.NEXTAUTH_URL, "http://127.0.0.1:3001", "http://127.0.0.1:3000"]
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
      const response = await fetch(new URL(path, base).toString(), {
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

function isMockLikeResponse(text: string): boolean {
  return /\[Mock .* response generated/i.test(text) || /User request:/i.test(text);
}

async function executeDirectBrowserExtractIntent(message: string): Promise<string | null> {
  const normalized = message.toLowerCase();
  const extractIntent = /(open|navigate|extract|visible text|text|content|scrape|find|search).*(extract|visible text|text|on|from|at)\s+(?:https?:\/\/)?([a-z0-9.-]+\.[a-z]{2,})/i.test(message) ||
    /search.*(linkedin|indeed|glassdoor|google)/i.test(normalized);

  if (!extractIntent) {
    return null;
  }

  // Handle site-specific shorthand
  let targetUrl = "";
  if (normalized.includes("linkedin")) targetUrl = "https://www.linkedin.com/jobs/search/";
  else if (normalized.includes("indeed")) targetUrl = "https://www.indeed.com/";
  else if (normalized.includes("glassdoor")) targetUrl = "https://www.glassdoor.com/";

  const urlMatch = message.match(/(https?:\/\/[^\s]+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?)/i);
  const url = targetUrl || (urlMatch ? (/^https?:\/\//i.test(urlMatch[1]) ? urlMatch[1] : `https://${urlMatch[1]}`) : null);

  if (!url) {
    if (/linkedin|indeed|glassdoor/i.test(normalized)) {
      // If we found a site name but no specific URL, we already set targetUrl above.
    } else {
      return null;
    }
  }

  try {
    await postInternalJson<BrowserToolRouteResult>("/api/agents/browser-tools", {
      tool: "browser_launch_browser",
      input: {},
    });

    const sessionPayload = await postInternalJson<BrowserToolRouteResult>("/api/agents/browser-tools", {
      tool: "browser_create_session",
      input: {},
    });

    const sessionId =
      (typeof sessionPayload.sessionId === "string" ? sessionPayload.sessionId : undefined) ??
      (sessionPayload.data && typeof sessionPayload.data.sessionId === "string"
        ? sessionPayload.data.sessionId
        : undefined);

    if (!sessionId) {
      throw new Error("Browser session could not be created.");
    }

    await postInternalJson<BrowserToolRouteResult>("/api/agents/browser-tools", {
      tool: "browser_open_page",
      input: { sessionId },
    });

    await postInternalJson<BrowserToolRouteResult>("/api/agents/browser-tools", {
      tool: "browser_navigate",
      input: { sessionId, url },
    });

    const extractPayload = await postInternalJson<BrowserToolRouteResult>("/api/agents/browser-tools", {
      tool: "browser_extract_text",
      input: { sessionId, selector: "body", maxLength: 1200 },
    });

    await postInternalJson<BrowserToolRouteResult>("/api/agents/browser-tools", {
      tool: "browser_close_session",
      input: { sessionId },
    });

    const extractedText =
      (extractPayload.data && typeof extractPayload.data.text === "string" ? extractPayload.data.text : "").trim();

    if (!extractedText) {
      return "I executed the browser extraction flow but no visible text was returned from the page.";
    }

    return `Live browser extract from ${url}:\n${extractedText}`;
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "Unknown browser extraction error";
    return `Browser extraction failed: ${messageText}`;
  }
}

function extractToolCall(input: string): ToolCall | null {
  const candidates: string[] = [];

  // Try to find markdown JSON blocks first
  const mdMatches = Array.from(input.matchAll(/```json\s*([\s\S]*?)```/gi), (match) => match[1]);
  candidates.push(...mdMatches);

  // Balanced brace matching to extract raw JSON objects
  let braceCount = 0;
  let currentBlock = "";
  let insideString = false;
  let escapeNext = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (escapeNext) {
      currentBlock += char;
      escapeNext = false;
      continue;
    }

    if (char === "\\") {
      currentBlock += char;
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      insideString = !insideString;
      currentBlock += char;
      continue;
    }

    if (!insideString) {
      if (char === "{") {
        braceCount++;
        currentBlock += char;
      } else if (char === "}") {
        braceCount--;
        currentBlock += char;
        if (braceCount === 0 && currentBlock.includes("{")) {
          candidates.push(currentBlock);
          currentBlock = "";
        }
      } else if (braceCount > 0) {
        currentBlock += char;
      }
    } else {
      currentBlock += char;
    }
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      const normalized = normalizeToolCallCandidate(parsed);
      if (normalized) {
        return normalized;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function inferToolCallFromUserMessage(input: string): ToolCall | null {
  const text = input.trim();

  const savePattern = /save (this )?job\s*:?\s*(.+?)\s+at\s+(.+?)\s+in\s+(.+?)(?:,|$)/i;
  const saveMatch = text.match(savePattern);
  if (saveMatch) {
    return {
      tool: "create_job",
      parameters: {
        title: saveMatch[2].trim(),
        company: saveMatch[3].trim(),
        location: saveMatch[4].trim(),
        source: "Agent Chat",
      },
    };
  }

  const searchPattern = /(find|search)\s+(.+?)\s+jobs?\s+in\s+(.+)$/i;
  const searchMatch = text.match(searchPattern);
  if (searchMatch) {
    return {
      tool: "job_search",
      parameters: {
        keywords: searchMatch[2].trim(),
        location: searchMatch[3].trim(),
      },
    };
  }

  return null;
}

function formatJobSearchResults(results: JobSearchResult[]): string {
  if (results.length === 0) {
    return "No live jobs found.";
  }

  return results
    .map(
      (job, index) =>
        `${index + 1}. ${job.title} | ${job.company} | ${job.salary} | ${job.location} | ${job.url || "No URL provided"}`,
    )
    .join("\n");
}

async function executeToolCall(toolCall: ToolCall): Promise<string> {
  if (toolCall.tool === "job_search") {
    const params = jobSearchToolSchema.parse(toolCall.parameters);
    const payload = await postInternalJson<{ success: boolean; importedCount: number; results: JobSearchResult[] }>(
      "/api/jobs/search",
      params,
    );
    return `Imported ${payload.importedCount} live jobs into your table.\n${formatJobSearchResults(payload.results)}`;
  }

  if (toolCall.tool === "create_job") {
    const params = createJobToolSchema.parse(toolCall.parameters);
    const payload = await postInternalJson<{ success: boolean; job: { id: string; title: string; company: string } }>(
      "/api/jobs",
      params,
    );
    return `I've added ${payload.job.title} at ${payload.job.company} to your Jobs list.`;
  }

  if (browserToolNames.has(toolCall.tool as BrowserToolName)) {
    const payload = await postInternalJson<Record<string, unknown>>("/api/agents/browser-tools", {
      tool: toolCall.tool,
      input: toolCall.parameters,
    });
    return JSON.stringify(payload, null, 2);
  }

  throw new Error(`Unsupported tool requested by model: ${toolCall.tool}`);
}

function normalizeAgentReply(input: string): string {
  let text = input.trim();

  // Remove common assistant-like lead-ins at sentence start.
  text = text.replace(
    /^(acknowledged|understood|got it|certainly|absolutely|great question|thanks for clarifying)[\s,.:;-]+/i,
    "",
  );

  // Light markdown cleanup for cleaner agent voice.
  text = text.replace(/\*\*(.*?)\*\*/g, "$1");
  text = text.replace(/^#{1,6}\s+/gm, "");

  return text.trim();
}

function enforceStrictAgentSchema(input: string, userMessage: string): string {
  const cleaned = normalizeAgentReply(input)
    .replace(/^[-*]\s+/gm, "")
    .trim();

  const lines = cleaned
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const decisionSeed = lines[0] ?? sentences[0] ?? "Proceed with the highest-fit, lowest-risk action path.";
  const decision = decisionSeed
    .replace(/^decision\s*:\s*/i, "")
    .replace(/^I will\s+/, "")
    .trim();

  const evidenceSeeds = [...lines, ...sentences]
    .map((item) => item.replace(/^evidence\s*:\s*/i, "").trim())
    .filter((item) => item.length > 20)
    .filter((item, index, arr) => arr.indexOf(item) === index)
    .slice(0, 3);

  const evidence = evidenceSeeds.length > 0
    ? evidenceSeeds
    : [
        "This direction minimizes noise while maximizing role-fit probability.",
        `It aligns with the current request context: ${userMessage.slice(0, 120)}.`,
      ];

  const nextActionLine =
    [...lines, ...sentences].find((item) => /next action|approve|confirm|proceed|send/i.test(item)) ??
    "Approve this direction and I will execute the top-priority step immediately.";

  const nextAction = nextActionLine
    .replace(/^next\s*action\s*:\s*/i, "")
    .trim();

  return [
    `Decision: ${decision}`,
    "Evidence:",
    ...evidence.map((item) => `- ${item}`),
    `Next Action: ${nextAction}`,
  ].join("\n");
}

export class ConversationOrchestrator {
  async run(context: AgentRuntimeContext): Promise<AgentRuntimeResponse> {
    const agent = await agentRegistry.getAgent(context.agentId, context.userId);
    const effectiveUserId = context.userId ?? agent.userId;
    let effectiveSessionId = context.sessionId;

    // ── Continuity sync: record activity, check idle rehydration ──────────
    continuitySyncService.recordActivity(agent.id);
    const { rehydrated } = await continuitySyncService.checkIdleRehydration(agent.id);
    continuitySyncService.addHistoryTurn(agent.id, "USER", context.message);

    let onboardingComplete = onboardingManager.isComplete(agent.id, agent.onboardingCompleted, effectiveUserId);

    // Allow operational/tooling requests to proceed without being blocked by onboarding.
    if (!onboardingComplete && toolIntentPattern.test(context.message)) {
      await onboardingManager.handleConversation(
        {
          ...context,
          message: "skip onboarding use defaults",
        },
        effectiveUserId,
      );
      onboardingComplete = true;
    }

    if (!onboardingComplete) {
      const onboardingResponse = await onboardingManager.handleConversation(
        {
          ...context,
          agentId: agent.id,
        },
        effectiveUserId,
      );

      if (effectiveUserId) {
        try {
          effectiveSessionId = await agentStore.createOrReuseSession({
            sessionId: context.sessionId,
            userId: effectiveUserId,
            agentId: agent.id,
            message: "Onboarding Session",
          });

          await agentStore.saveMessage({
            sessionId: effectiveSessionId,
            role: "USER" as MessageRole,
            content: context.message,
            tokenEstimate: Math.ceil(context.message.length / 4),
          });

          if (onboardingResponse.completed) {
            await agentStore.saveMessage({
              sessionId: effectiveSessionId,
              role: "SYSTEM" as MessageRole,
              content: "Onboarding completed",
              tokenEstimate: 4,
            });
          }

          await agentStore.saveMessage({
            sessionId: effectiveSessionId,
            role: "ASSISTANT" as MessageRole,
            content: onboardingResponse.reply,
            tokenEstimate: Math.ceil(onboardingResponse.reply.length / 4),
          });
        } catch {
          effectiveSessionId = context.sessionId;
        }
      }

      continuitySyncService.addHistoryTurn(agent.id, "ASSISTANT", onboardingResponse.reply);
      await continuitySyncService.syncPostStep(
        agent.id,
        `Onboarding step handled. Completed: ${onboardingResponse.completed}`,
        [],
        { currentTaskState: onboardingResponse.completed ? "onboarding-complete" : "onboarding" },
      );

      return {
        reply: onboardingResponse.reply,
        shouldWriteSummary: onboardingResponse.completed,
        loopPrevented: false,
        onboardingCompleted: onboardingResponse.completed,
        sessionId: effectiveSessionId,
        profileSnapshot: onboardingResponse.profileSnapshot,
        continuitySynced: true,
        rehydrated,
      };
    }

    const loopCheck = loopPreventionGuard.checkMessage(context.agentId, context.message, context.sessionId);
    if (loopCheck.blocked) {
      continuitySyncService.updateMind(agent.id, { loopPreventionState: "triggered" });
      return {
        reply: loopCheck.reason ?? "Loop prevented.",
        shouldWriteSummary: false,
        loopPrevented: true,
        sessionId: context.sessionId,
        continuitySynced: false,
        rehydrated,
      };
    }
    continuitySyncService.updateMind(agent.id, { loopPreventionState: "clear" });

    const budget = tokenBudgetManager.checkResponseBudget({
      message: context.message,
      budget: agent.responseBudgetTokens,
    });

    let memorySummary = "";
    if (effectiveUserId) {
      try {
        memorySummary = await agentStore.getMemorySummary(agent.id, 3);
      } catch {
        memorySummary = "";
      }
    }
    const systemPrompt = composeAgentSystemPrompt(agent, memorySummary);
    continuitySyncService.updateMind(agent.id, {
      activeToolIntentions: toolDescriptors.map((tool) => tool.name),
    });

    // ── Pre-step sync ──────────────────────────────────────────────────────
    await continuitySyncService.syncPreStep(agent.id, "Sending user message to AI provider");

    const provider = getAiProvider(context.preferredProvider);
    let aiResponseText = "";
    let toolContext = "";
    let lastToolResult = "";
    let lastToolName = "";
    const toolLogs: Array<{ tool: string; parameters: any; result: string }> = [];

    const directBrowserText = await executeDirectBrowserExtractIntent(context.message);
    if (directBrowserText) {
      aiResponseText = directBrowserText;
    }

    for (let round = 0; round < maxToolRounds && !aiResponseText; round += 1) {
      const aiResponse = await provider.chat({
        systemPrompt,
        userPrompt: [
          `User request: ${context.message}`,
          toolContext ? `Tool results so far:\n${toolContext}` : null,
          round > 0 ? "Use the tool results to answer the user directly. Only emit another tool call if absolutely necessary." : null,
        ]
          .filter(Boolean)
          .join("\n\n"),
        model: context.preferredModel ?? agent.model,
        temperature: 0.4,
        apiKey: context.apiKey,
      });

      if (aiResponse.text.includes("failed:") || aiResponse.text.includes("API key missing")) {
        aiResponseText = aiResponse.text;
        break;
      }

      const toolCall = extractToolCall(aiResponse.text) ?? (round === 0 ? inferToolCallFromUserMessage(context.message) : null);
      if (!toolCall) {
        aiResponseText = aiResponse.text;
        break;
      }

      let toolResult = "";
      try {
        toolResult = await executeToolCall(toolCall);
        toolLogs.push({
          tool: toolCall.tool,
          parameters: toolCall.parameters,
          result: toolResult,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown tool execution error";
        toolResult = `Tool execution failed: ${message}`;

        if (/Adzuna API keys not configured/i.test(message)) {
          aiResponseText = message;
          break;
        }
      }

      continuitySyncService.recordToolResult(agent.id, `${toolCall.tool}: ${toolResult.slice(0, 500)}`);
      toolContext = `${toolContext}\nTool: ${toolCall.tool}\nResult:\n${toolResult}`.trim();
      lastToolName = toolCall.tool;
      lastToolResult = toolResult;

      if (toolCall.tool === "create_job") {
        aiResponseText = toolResult;
        break;
      }

      if (round === maxToolRounds - 1) {
        aiResponseText = `I reached the tool execution limit. Latest tool result:\n${toolResult}`;
      }
    }

    if (!aiResponseText && lastToolResult) {
      aiResponseText = lastToolResult;
    }

    if (isMockLikeResponse(aiResponseText) && lastToolResult) {
      aiResponseText =
        lastToolName === "create_job"
          ? lastToolResult
          : lastToolName === "job_search"
          ? `Live job search results:\n${lastToolResult}`
          : `Live tool result:\n${lastToolResult}`;
    }

    const strictMode = context.strictAgentResponseMode ?? false;
    const isError = aiResponseText.includes("failed:") || aiResponseText.includes("API key missing");

    let normalizedReply = (strictMode && !isError)
      ? enforceStrictAgentSchema(aiResponseText, context.message)
      : normalizeAgentReply(aiResponseText);

    // Append integration disclaimer if fallback results were used (check lastToolResult directly)
    if (lastToolName === "job_search" && lastToolResult.includes("[IMPORTANT]")) {
      normalizedReply = `${normalizedReply}\n\n[NOTICE] My live search integration is currently in fallback mode. Please configure your Adzuna API keys in the .env file to see live market data.`;
    }

    if (effectiveUserId) {
      try {
        effectiveSessionId = await agentStore.createOrReuseSession({
          sessionId: context.sessionId,
          userId: effectiveUserId,
          agentId: agent.id,
          message: context.message,
        });

        await agentStore.saveMessage({
          sessionId: effectiveSessionId,
          role: "USER" as MessageRole,
          content: context.message,
          tokenEstimate: Math.ceil(context.message.length / 4),
        });

        await agentStore.saveMessage({
          sessionId: effectiveSessionId,
          role: "ASSISTANT" as MessageRole,
          content: normalizedReply,
          tokenEstimate: Math.ceil(normalizedReply.length / 4),
        });

        await agentStore.saveMemoryChunk({
          agentId: agent.id,
          userId: effectiveUserId,
          kind: "SESSION" as MemoryKind,
          content: `User asked: ${context.message}. Assistant responded after tool planning.${toolContext ? ` Tool context: ${toolContext}` : ""}`,
          summary: "Recent chat exchange",
          importanceScore: 0.65,
          metadata: { sessionId: effectiveSessionId, usedTools: Boolean(toolContext) },
        });
      } catch {
        effectiveSessionId = context.sessionId;
      }
    }

    personalityEvolutionManager.applyEvidence(agent.id, {
      concisePreferred: context.message.toLowerCase().includes("concise"),
      strategicPreferred: context.message.toLowerCase().includes("strategy"),
    });

    // ── Post-step sync ─────────────────────────────────────────────────────
    continuitySyncService.addHistoryTurn(agent.id, "ASSISTANT", normalizedReply);
    continuitySyncService.updateCurrentDirection(agent.id, context.message.slice(0, 100));
    await continuitySyncService.syncPostStep(
      agent.id,
      `AI response generated${toolContext ? " with tool execution" : " without tools"}`,
      [],
      { currentTaskState: "ready", activeExecutionContext: "chat" },
    );

    if (effectiveUserId) {
      try {
        const memoryCount = await agentStore.getMemoryCount(agent.id);
        if (memoryCount >= 12) {
          const summary = "Compacted older memory blocks into one strategic summary for token efficiency.";
          await agentStore.compactMemory(agent.id, summary);
        }
      } catch {
        // Ignore DB compaction in local fallback mode.
      }
    } else {
      memoryCompactionService.compactIfNeeded(agent.id, 12);
    }

    return {
      reply: normalizedReply,
      shouldWriteSummary: true,
      loopPrevented: false,
      tokenBudgetWarning: budget.warning,
      sessionId: effectiveSessionId,
      onboardingCompleted: true,
      continuitySynced: true,
      rehydrated,
      toolLogs,
    };
  }
}

export const conversationOrchestrator = new ConversationOrchestrator();
