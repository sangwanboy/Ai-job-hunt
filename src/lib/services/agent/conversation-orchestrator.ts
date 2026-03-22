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

const maxToolRounds = 25;

const toolIntentPattern = /(\bfind\b|\bsearch\b|\bjob\b|\bsave\b|\badd\b|\bcreate\b|\bnavigate\b|\bopen\b|\bclick\b|\bextract\b|\bbrowser\b)/i;

// In-memory pending jobs store (session-scoped)
type PendingJob = {
  title: string;
  company: string;
  location: string;
  url: string;
  salary?: string;
  source?: string;
};
const pendingJobsStore = new Map<string, PendingJob[]>();

const toolDescriptors = [
  {
    name: "preview_jobs",
    description: "Preview jobs to show the user before importing. Parameters: { jobs: Array<{ title: string, company: string, location: string, url: string, salary?: string, source?: string }> }",
    parameters: {
      jobs: "Array<{ title: string, company: string, location: string, url: string, salary?: string, source?: string }>",
    },
  },
  {
    name: "import_pending_jobs",
    description: "Import previously previewed jobs into the pipeline after user confirmation. Parameters: { action: 'import_all' | 'import_selected', indices?: number[] }",
    parameters: {
      action: "string",
      indices: "number[]?",
    },
  },
  {
    name: "save_job",
    description: "Directly save a single job to the pipeline. Use only when user explicitly asks to add one specific job. Parameters: { title: string, company: string, location: string, salary?: string, url?: string, source?: string }",
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
  description: z.string().optional(),
  skills: z.string().optional(),
  datePosted: z.string().optional(),
});

const previewJobSchema = z.object({
  title: z.string().min(1),
  company: z.string().min(1),
  location: z.string().min(1),
  url: z.string().min(1),
  salary: z.string().optional(),
  source: z.string().default("Agent Search"),
  description: z.string().optional(),
  skills: z.string().optional(),
  datePosted: z.string().optional(),
});

const previewJobsToolSchema = z.object({
  jobs: z.array(previewJobSchema).min(1),
});

const importPendingJobsSchema = z.object({
  action: z.enum(["import_all", "import_selected"]),
  indices: z.array(z.number()).optional(),
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
  const results: ToolCall[] = [];
  const candidates: string[] = [];

  // Strategy 1: Extract JSON from markdown code fences (```json ... ``` or ``` ... ```)
  const fencedMatches = Array.from(
    input.matchAll(/```(?:json)?\s*\n?([\s\S]*?)\n?```/gi),
    (match) => match[1].trim()
  );
  candidates.push(...fencedMatches);

  // Strategy 2: Brace-matching for bare JSON objects in text
  let braceDepth = 0;
  let blockStart = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && inString) { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (ch === '{') {
      if (braceDepth === 0) blockStart = i;
      braceDepth++;
    } else if (ch === '}') {
      braceDepth--;
      if (braceDepth === 0 && blockStart >= 0) {
        const block = input.slice(blockStart, i + 1);
        // Only consider blocks that look like tool calls (contain "tool" or "name")
        if (block.includes('"tool"') || block.includes('"name"') || block.includes('"function_call"')) {
          candidates.push(block);
        }
        blockStart = -1;
      }
    }
  }

  // Strategy 3: Regex fallback for common tool call patterns
  const regexPatterns = [
    /\{\s*"tool"\s*:\s*"[^"]+"\s*,\s*"parameters"\s*:\s*\{[^}]*(?:\{[^}]*\}[^}]*)*\}\s*\}/g,
    /\{\s*"name"\s*:\s*"[^"]+"\s*,\s*"arguments"\s*:\s*\{[^}]*(?:\{[^}]*\}[^}]*)*\}\s*\}/g,
  ];
  for (const pattern of regexPatterns) {
    for (const match of input.matchAll(pattern)) {
      candidates.push(match[0]);
    }
  }

  // Deduplicate and parse
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const normalized = normalizeToolCallCandidate(parsed);
      if (normalized) {
        results.push(normalized);
        console.log(`[Orchestrator] ✓ Extracted tool call: ${normalized.tool}`, JSON.stringify(normalized.parameters).slice(0, 200));
      }
    } catch {
      // Try to fix common JSON issues (trailing commas, etc.)
      try {
        const cleaned = trimmed.replace(/,\s*([}\]])/g, '$1');
        const parsed = JSON.parse(cleaned) as Record<string, unknown>;
        const normalized = normalizeToolCallCandidate(parsed);
        if (normalized) {
          results.push(normalized);
          console.log(`[Orchestrator] ✓ Extracted tool call (cleaned): ${normalized.tool}`);
        }
      } catch {
        console.log(`[Orchestrator] ✗ Failed to parse candidate:`, trimmed.slice(0, 200));
      }
    }
  }

  if (results.length === 0 && (input.includes('"tool"') || input.includes('save_job') || input.includes('browser_'))) {
    console.log(`[Orchestrator] ⚠ Response appears to contain tool intent but no tool calls were extracted.`);
    console.log(`[Orchestrator] Response preview:`, input.slice(0, 500));
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

// Removed: inferToolCallFromUserMessage was too aggressive and contaminated
// the pipeline with chat messages being saved as jobs.
// The model now handles all tool calls through the extractToolCalls parser.
function inferToolCallFromUserMessage(_input: string): ToolCall | null {
  return null;
}

// Track the current session for pending jobs (set during orchestrator run)
let currentOrchestratorSessionId = "default";

async function executeToolCall(toolCall: ToolCall): Promise<string> {
  if (toolCall.tool === "preview_jobs") {
    const params = previewJobsToolSchema.parse(toolCall.parameters);
    // Store the jobs in pending buffer for this session
    pendingJobsStore.set(currentOrchestratorSessionId, params.jobs);
    const jobList = params.jobs.map((j, i) => `${i + 1}. **${j.title}** at ${j.company} (${j.location})${j.salary ? ` — ${j.salary}` : ""}`).join("\n");
    return `__PREVIEW_JOBS__${JSON.stringify(params.jobs)}__END_PREVIEW__\n\nPreviewed ${params.jobs.length} job(s) for user review:\n${jobList}\n\nWait for user confirmation before importing. Do NOT call save_job or import_pending_jobs yet.`;
  }
  if (toolCall.tool === "import_pending_jobs") {
    const params = importPendingJobsSchema.parse(toolCall.parameters);
    const pending = pendingJobsStore.get(currentOrchestratorSessionId);
    if (!pending || pending.length === 0) {
      return "No pending jobs to import. The user may need to search for jobs first.";
    }
    const jobsToImport = params.action === "import_all"
      ? pending
      : (params.indices || []).map(i => pending[i]).filter(Boolean);
    
    const results: string[] = [];
    for (const job of jobsToImport) {
      try {
        const payload = await postInternalJson<{ success: boolean; job: { id: string; title: string; company: string } }>("/api/jobs", {
          title: job.title,
          company: job.company,
          location: job.location,
          url: job.url,
          salary: job.salary,
          source: job.source || "Agent Search",
        });
        results.push(`✅ "${payload.job.title}" at ${payload.job.company} — saved`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        results.push(`❌ "${job.title}" at ${job.company} — failed: ${msg}`);
      }
    }
    // Clear pending after import
    pendingJobsStore.delete(currentOrchestratorSessionId);
    return `Imported ${results.filter(r => r.startsWith("✅")).length}/${jobsToImport.length} jobs:\n${results.join("\n")}\n\nNow provide a MARKDOWN TABLE summary to the user.`;
  }
  if (toolCall.tool === "save_job") {
    const params = saveJobToolSchema.parse(toolCall.parameters);
    const payload = await postInternalJson<{ success: boolean; job: { id: string; title: string; company: string } }>("/api/jobs", params);
    return `Job saved: "${payload.job.title}" at ${payload.job.company} added to your pipeline.`;
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
  // Strip continuity update block but keep the rest
  text = text.replace(/<continuity_update>[\s\S]*?<\/continuity_update>/gi, "");
  // Strip preview jobs markers (data is passed separately via pendingJobs field)
  text = text.replace(/__PREVIEW_JOBS__[\s\S]*?__END_PREVIEW__/g, "");
  text = text.trim();
  
  if (!text) {
    return "Action performed. I'm updating my state.";
  }
  
  return text;
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
          await continuitySyncService.syncPostStep(agent.id, sid, "Onboarding step", [], { mode: "READY" });
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
    
    // Set the session context for pending jobs store
    currentOrchestratorSessionId = sid;

    // Clean up historyContext string if it's the "No history" default
    const formattedHistory = (historyContext && historyContext !== "No history yet.") ? historyContext : null;

    for (let round = 0; round < maxToolRounds && !aiResponseText; round++) {
      console.log(`[Orchestrator] === Tool Loop Round ${round + 1}/${maxToolRounds} ===`);

      const continuationPrompt = round > 0
        ? [
            `ORIGINAL USER REQUEST (re-read this carefully): "${context.message}"`,
            "",
            `You have completed ${round} tool call(s) so far. You have ${maxToolRounds - round} rounds remaining.`,
            "Analyze the tool results above. Compare them against the ORIGINAL USER REQUEST.",
            "If ANY part of the user's request is NOT yet fulfilled, call the NEXT tool immediately.",
            "For multi-step tasks (Step 1, Step 2, etc.), you MUST complete ALL steps before giving a final response.",
            "Do NOT produce a summary table until ALL steps are done.",
            "",
            "Available tools: save_job, browser_navigate, browser_click, browser_extract_jobs, browser_type, browser_screenshot, browser_extract_text.",
            "Output ONLY the JSON tool call: { \"tool\": \"name\", \"parameters\": { ... } }",
            "Only after ALL parts of the request are complete should you provide a final summary to the user."
          ].join("\n")
        : null;

      const aiResponse = await provider.chat({
        systemPrompt,
        userPrompt: [
          formattedHistory ? `Previous conversation history:\n${formattedHistory}` : null,
          `User request: ${context.message}`,
          toolContext ? `Tool results from previous steps:\n${toolContext}` : null,
          continuationPrompt
        ].filter(Boolean).join("\n\n"),
        model: context.preferredModel ?? agent.model,
        temperature: 0.4,
        apiKey: context.apiKey,
      });

      console.log(`[Orchestrator] AI response (${aiResponse.text.length} chars):`, aiResponse.text.slice(0, 300));

      // Only break on actual API errors from the provider, not content that mentions "failed"
      if (aiResponse.text.startsWith("Gemini request failed:") || aiResponse.text.includes("[Gemini API key missing")) {
        aiResponseText = aiResponse.text;
        break;
      }

      const toolCalls = extractToolCalls(aiResponse.text);
      console.log(`[Orchestrator] Extracted ${toolCalls.length} tool call(s) from round ${round + 1}`);

      if (toolCalls.length === 0 && round === 0) {
        const inf = inferToolCallFromUserMessage(context.message);
        if (inf) {
          toolCalls.push(inf);
          console.log(`[Orchestrator] Inferred tool call from user message: ${inf.tool}`);
        }
      }

      if (toolCalls.length === 0) {
        // No tool calls — treat as final response
        aiResponseText = aiResponse.text;
        console.log(`[Orchestrator] No tool calls found, ending loop with text response`);
        break;
      }

      let turnRes = "";
      for (const call of toolCalls) {
        try {
          console.log(`[Orchestrator] Executing tool: ${call.tool}`, JSON.stringify(call.parameters).slice(0, 200));
          const res = await executeToolCall(call);
          toolLogs.push({ tool: call.tool, parameters: call.parameters, result: res });
          turnRes += `\nTool: ${call.tool}\nResult: ${res}\n`;
          continuitySyncService.recordToolResult(agent.id, sid, `${call.tool}: ${res.slice(0, 300)}`);
          console.log(`[Orchestrator] ✓ Tool ${call.tool} succeeded:`, res.slice(0, 200));
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : "Unknown error";
          console.error(`[Orchestrator] ✗ Tool ${call.tool} failed:`, errorMsg);
          toolLogs.push({ tool: call.tool, parameters: call.parameters, result: `Error: ${errorMsg}` });
          turnRes += `\nTool: ${call.tool}\nResult: Error — ${errorMsg}. Try a different approach or skip this step.\n`;
        }
      }
      toolContext = (toolContext + "\n" + turnRes).trim();
    }

    // If the loop exhausted all rounds without a final text response, ask the LLM for a summary
    if (!aiResponseText && toolLogs.length > 0) {
      console.log(`[Orchestrator] Loop exhausted ${maxToolRounds} rounds with ${toolLogs.length} tool calls. Requesting final summary.`);
      try {
        const summaryResponse = await provider.chat({
          systemPrompt: "You are a job search assistant. Summarize the actions you took and their results. Present saved jobs in a markdown table with columns: Title, Company, Location, URL, Status. Be concise.",
          userPrompt: [
            `Original user request: ${context.message}`,
            `Tool execution log:\n${toolLogs.map((l, i) => `${i + 1}. ${l.tool}: ${l.result.slice(0, 200)}`).join("\n")}`,
            "Provide a final summary response to the user with a markdown table of all saved jobs."
          ].join("\n\n"),
          model: context.preferredModel ?? agent.model,
          temperature: 0.3,
          apiKey: context.apiKey,
        });
        aiResponseText = summaryResponse.text;
      } catch {
        // Fallback: build a simple summary from tool logs
        const savedJobs = toolLogs.filter(l => l.tool === "save_job");
        aiResponseText = savedJobs.length > 0
          ? `I completed ${toolLogs.length} actions and saved ${savedJobs.length} job(s) to your pipeline:\n\n${savedJobs.map((l, i) => `${i + 1}. ${l.result}`).join("\n")}`
          : `I completed ${toolLogs.length} actions but was unable to save any jobs. Please try again with different search terms.`;
      }
    }
    const isError = aiResponseText.startsWith("Gemini request failed:") || aiResponseText.includes("[Gemini API key missing");
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

    await continuitySyncService.syncPostStep(agent.id, sid, "Generated", [], { mode: "READY" });

    // Extract pending jobs from the response for the frontend to render as preview cards
    const pendingJobs = pendingJobsStore.get(sid) || null;
    
    return { reply: normalizedReply, shouldWriteSummary: true, loopPrevented: false, tokenBudgetWarning: budget.warning, sessionId: effectiveSessionId, onboardingCompleted: true, continuitySynced: true, rehydrated, toolLogs, pendingJobs };
  }
}

export const conversationOrchestrator = new ConversationOrchestrator();
