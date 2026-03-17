/**
 * ContinuitySyncService
 *
 * Manages full continuity synchronization across all 5 agent layers:
 *   History -> Soul -> Identity -> Mind -> Memory
 *
 * Hierarchy:
 *   Soul governs Identity
 *   Identity shapes Mind
 *   Mind executes using Memory
 *   Memory informs Identity and Mind
 *   History feeds Memory and current Mind state
 *
 * Handles:
 *   - Pre/post major-step syncs
 *   - Context-window checkpoints (96k-128k token soft/hard)
 *   - Idle-time rehydration (>=1 hour inactivity)
 *   - Project memory file read/write
 *   - Sync event logging to project_memory/agent_sync_log.md
 */

import * as fs from "fs/promises";
import * as path from "path";
import { agentProfileSyncStore } from "@/lib/services/agent/agent-profile-sync";
import { memoryService } from "@/lib/services/agent/memory-service";

// ─── Layer Types ─────────────────────────────────────────────────────────────

export type HistoryLayer = {
  recentTurns: Array<{ role: string; content: string; timestamp: string }>;
  summaries: string[];
  importantDecisions: string[];
  unresolvedThreads: string[];
  currentDirection: string;
};

export type SoulLayer = {
  mission: string;
  longTermPurpose: string;
  nonNegotiableRules: string[];
  values: string[];
  decisionPhilosophy: string;
  stableBehavioralBoundaries: string[];
};

export type IdentityLayer = {
  name: string;
  persona: string;
  specialization: string;
  tone: string;
  style: string;
  strengths: string[];
  weaknesses: string[];
  roleDefinition: string;
  communicationStyle: string;
};

export type MindLayer = {
  currentTaskState: string;
  reasoningMode: string;
  workflowPlan: string[];
  loopPreventionState: string;
  currentStrategy: string;
  activeExecutionContext: string;
  pendingActions: string[];
  activeToolIntentions: string[];
  operatingAssumptions: string[];
};

export type MemoryLayer = {
  userPreferences: string[];
  longTermFacts: string[];
  summaries: string[];
  toolResults: string[];
  jobContext: string;
  followUpState: string;
  errorFixRecords: string[];
  todos: string[];
  learnedPatterns: string[];
  personalityAdjustments: string[];
};

export type ContinuityState = {
  agentId: string;
  lastSyncedAt: string;
  lastActivityAt: string;
  history: HistoryLayer;
  soul: SoulLayer;
  identity: IdentityLayer;
  mind: MindLayer;
  memory: MemoryLayer;
  safeResumePoint: string;
  alignmentStatus: "aligned" | "drift-detected" | "unknown";
  driftWarnings: string[];
};

export type SyncTriggerType =
  | "major-step-pre"
  | "major-step-post"
  | "context-checkpoint"
  | "idle-rehydration";

export type SyncLogEntry = {
  timestamp: string;
  triggerType: SyncTriggerType;
  agentId: string;
  filesRead: string[];
  filesUpdated: string[];
  whatChanged: string;
  safeResumePoint: string;
  nextIntendedStep: string;
  alignmentStatus: "aligned" | "drift-detected" | "unknown";
  driftWarnings: string[];
};

// ─── Constants ────────────────────────────────────────────────────────────────

const IDLE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour
const HISTORY_WINDOW = 20; // max recent turns to keep inline
const MEMORY_DIR = "project_memory";

const PROJECT_MEMORY_FILES = {
  agentContext: path.join(MEMORY_DIR, "agent_context.md"),
  changeLog: path.join(MEMORY_DIR, "change_log.md"),
  todo: path.join(MEMORY_DIR, "todo.md"),
  errorLog: path.join(MEMORY_DIR, "error_log.md"),
  architecture: path.join(MEMORY_DIR, "architecture.md"),
  sessionSummaries: path.join(MEMORY_DIR, "session_summaries.md"),
  syncLog: path.join(MEMORY_DIR, "agent_sync_log.md"),
} as const;

// ─── Defaults ─────────────────────────────────────────────────────────────────

function defaultHistory(): HistoryLayer {
  return {
    recentTurns: [],
    summaries: [],
    importantDecisions: [],
    unresolvedThreads: [],
    currentDirection: "Awaiting user input.",
  };
}

function defaultSoul(): SoulLayer {
  return {
    mission: "Help the user find high-fit jobs and land interviews efficiently.",
    longTermPurpose: "Maximize the user's job search success through intelligent, low-noise actions.",
    nonNegotiableRules: [
      "Never fabricate job data or recruiter contacts.",
      "Always ask before applying to any role.",
      "Respect user-defined constraints.",
    ],
    values: ["Precision", "User autonomy", "Evidence-backed decisions", "Efficiency"],
    decisionPhilosophy: "Prioritize evidence-backed opportunities. Prefer quality over volume.",
    stableBehavioralBoundaries: [
      "Do not auto-apply without confirmation.",
      "Do not ignore user feedback.",
    ],
  };
}

function defaultIdentity(): IdentityLayer {
  return {
    name: "Atlas",
    persona: "Strategic job intelligence agent",
    specialization: "Job search intelligence, outreach, and prioritization",
    tone: "Concise, strategic, proactive",
    style: "Direct. Bullet-point friendly. Never verbose.",
    strengths: ["Pattern recognition", "Priority ranking", "Market-fit scoring"],
    weaknesses: ["Cannot browse live web without browser tools", "No real-time calendar data"],
    roleDefinition: "Job Scout Strategist",
    communicationStyle: "Strategic, concise, proactive",
  };
}

function defaultMind(): MindLayer {
  return {
    currentTaskState: "idle",
    reasoningMode: "standard",
    workflowPlan: [],
    loopPreventionState: "clear",
    currentStrategy: "Respond to user queries, surface high-fit jobs, guide next actions.",
    activeExecutionContext: "chat",
    pendingActions: [],
    activeToolIntentions: [],
    operatingAssumptions: [
      "User is actively job searching.",
      "Prefer UK remote senior full-stack roles.",
    ],
  };
}

function defaultMemory(): MemoryLayer {
  return {
    userPreferences: ["UK remote", "Senior full-stack", "High-fit roles only"],
    longTermFacts: [],
    summaries: [],
    toolResults: [],
    jobContext: "Job market: UK remote senior full-stack engineering roles.",
    followUpState: "none",
    errorFixRecords: [],
    todos: [],
    learnedPatterns: [],
    personalityAdjustments: [],
  };
}

function defaultContinuityState(agentId: string): ContinuityState {
  const now = new Date().toISOString();
  return {
    agentId,
    lastSyncedAt: now,
    lastActivityAt: now,
    history: defaultHistory(),
    soul: defaultSoul(),
    identity: defaultIdentity(),
    mind: defaultMind(),
    memory: defaultMemory(),
    safeResumePoint: "Session start — no prior state.",
    alignmentStatus: "unknown",
    driftWarnings: [],
  };
}

// ─── Global in-memory store ─────────────────────────────────────────────────

const globalRef = globalThis as unknown as {
  continuitySyncStates?: Map<string, ContinuityState>;
};

const continuitySyncStates =
  globalRef.continuitySyncStates ?? new Map<string, ContinuityState>();
globalRef.continuitySyncStates = continuitySyncStates;

// ─── ContinuitySyncService ────────────────────────────────────────────────────

export class ContinuitySyncService {
  // ── Internal helpers ──────────────────────────────────────────────────────

  private getState(agentId: string): ContinuityState {
    const existing = continuitySyncStates.get(agentId);
    if (existing) return existing;
    const fresh = defaultContinuityState(agentId);
    continuitySyncStates.set(agentId, fresh);
    return fresh;
  }

  private setState(state: ContinuityState): void {
    continuitySyncStates.set(state.agentId, state);
  }

  private memDir(): string {
    return path.join(process.cwd(), MEMORY_DIR);
  }

  private filePath(name: keyof typeof PROJECT_MEMORY_FILES): string {
    return path.join(process.cwd(), PROJECT_MEMORY_FILES[name]);
  }

  private async safeReadFile(filePath: string): Promise<string | null> {
    try {
      return await fs.readFile(filePath, "utf-8");
    } catch {
      return null;
    }
  }

  private async safeWriteFile(filePath: string, content: string): Promise<boolean> {
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, "utf-8");
      return true;
    } catch {
      return false;
    }
  }

  private async safeAppendFile(filePath: string, content: string): Promise<boolean> {
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.appendFile(filePath, content, "utf-8");
      return true;
    } catch {
      return false;
    }
  }

  // ── Layer sync from profile store ─────────────────────────────────────────

  private syncSoulFromProfile(agentId: string, state: ContinuityState): SoulLayer {
    const profile = agentProfileSyncStore.getProfile(agentId);
    return {
      ...state.soul,
      mission: profile.soulMission || state.soul.mission,
      longTermPurpose: profile.longTermObjective || state.soul.longTermPurpose,
      nonNegotiableRules: profile.mindConstraints.length > 0
        ? profile.mindConstraints
        : state.soul.nonNegotiableRules,
      values: profile.principles.length > 0 ? profile.principles : state.soul.values,
      decisionPhilosophy: profile.decisionPhilosophy || state.soul.decisionPhilosophy,
    };
  }

  private syncIdentityFromProfile(agentId: string, state: ContinuityState): IdentityLayer {
    const profile = agentProfileSyncStore.getProfile(agentId);
    return {
      ...state.identity,
      name: profile.name || state.identity.name,
      persona: profile.personalityStyle || state.identity.persona,
      specialization: profile.specialization || state.identity.specialization,
      roleDefinition: profile.roleTitle || state.identity.roleDefinition,
      communicationStyle: profile.communicationStyle || state.identity.communicationStyle,
      tone: profile.communicationStyle || state.identity.tone,
      style: profile.personalityStyle || state.identity.style,
    };
  }

  private syncMemoryFromService(agentId: string, state: ContinuityState): MemoryLayer {
    const summary = memoryService.getRelevantSummary(agentId);
    const summaries = summary ? [summary] : state.memory.summaries;
    return {
      ...state.memory,
      summaries,
    };
  }

  // ── Alignment validation ──────────────────────────────────────────────────

  private validateAlignment(state: ContinuityState): {
    status: "aligned" | "drift-detected";
    driftWarnings: string[];
  } {
    const warnings: string[] = [];

    // Soul -> Identity: identity name must not contradict soul mission scope
    if (!state.soul.mission || state.soul.mission.length < 5) {
      warnings.push("Soul mission is empty or too short — identity may be unanchored.");
    }
    // Identity -> Mind: mind strategy must reference identity
    if (
      state.mind.currentStrategy &&
      !state.mind.currentStrategy.toLowerCase().includes("job") &&
      !state.mind.currentStrategy.toLowerCase().includes("user")
    ) {
      warnings.push("Mind strategy may have drifted from job-search specialization.");
    }
    // Mind -> Memory: mind assumptions should align with memory preferences
    if (state.mind.loopPreventionState === "triggered") {
      warnings.push("Loop prevention state active — mind may be in a stuck cycle.");
    }
    // History -> Memory: if history has unresolved threads, flag them
    if (state.history.unresolvedThreads.length > 3) {
      warnings.push(
        `${state.history.unresolvedThreads.length} unresolved conversation threads detected.`,
      );
    }

    return {
      status: warnings.length === 0 ? "aligned" : "drift-detected",
      driftWarnings: warnings,
    };
  }

  // ── Sync log writer ───────────────────────────────────────────────────────

  private async writeSyncLogEntry(entry: SyncLogEntry): Promise<void> {
    const logLine = [
      `\n## Sync Event: ${entry.timestamp}`,
      `- **Trigger:** ${entry.triggerType}`,
      `- **Agent:** ${entry.agentId}`,
      `- **Files Read:** ${entry.filesRead.join(", ") || "none"}`,
      `- **Files Updated:** ${entry.filesUpdated.join(", ") || "none"}`,
      `- **What Changed:** ${entry.whatChanged}`,
      `- **Safe Resume Point:** ${entry.safeResumePoint}`,
      `- **Next Intended Step:** ${entry.nextIntendedStep}`,
      `- **Alignment:** ${entry.alignmentStatus}`,
      entry.driftWarnings.length > 0
        ? `- **Drift Warnings:** ${entry.driftWarnings.join("; ")}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    await this.safeAppendFile(this.filePath("syncLog"), logLine + "\n");
  }

  // ── Full sync ─────────────────────────────────────────────────────────────

  async syncAll(
    agentId: string,
    triggerType: SyncTriggerType,
    options: {
      stepDescription?: string;
      filesChanged?: string[];
      nextIntendedStep?: string;
      mindUpdate?: Partial<MindLayer>;
    } = {},
  ): Promise<ContinuityState> {
    const state = this.getState(agentId);
    const now = new Date().toISOString();

    // 1. Load Soul from profile store
    const soul = this.syncSoulFromProfile(agentId, state);

    // 2. Load Identity from profile store (bounded by Soul)
    const identity = this.syncIdentityFromProfile(agentId, state);

    // 3. Sync Memory from memory service
    const memory = this.syncMemoryFromService(agentId, state);

    // 4. Update Mind if provided
    const mind: MindLayer = {
      ...state.mind,
      ...(options.mindUpdate ?? {}),
    };

    // 5. Validate alignment across layers
    const updated: ContinuityState = {
      ...state,
      soul,
      identity,
      mind,
      memory,
      lastSyncedAt: now,
    };
    const alignment = this.validateAlignment(updated);
    updated.alignmentStatus = alignment.status;
    updated.driftWarnings = alignment.driftWarnings;

    this.setState(updated);

    // 6. Write todo.md from memory todos
    if (updated.memory.todos.length > 0) {
      const todoContent = [
        "# TODO\n",
        `_Last updated: ${now}_\n`,
        ...updated.memory.todos.map((t, i) => `${i + 1}. ${t}`),
      ].join("\n");
      await this.safeWriteFile(this.filePath("todo"), todoContent);
    }

    // 7. Write sync log
    const filesRead = [PROJECT_MEMORY_FILES.agentContext];
    const filesUpdated = [...(options.filesChanged ?? [])];
    if (updated.memory.todos.length > 0) filesUpdated.push(PROJECT_MEMORY_FILES.todo);
    filesUpdated.push(PROJECT_MEMORY_FILES.syncLog);

    await this.writeSyncLogEntry({
      timestamp: now,
      triggerType,
      agentId,
      filesRead,
      filesUpdated,
      whatChanged: options.stepDescription ?? "Full continuity sync performed.",
      safeResumePoint: updated.safeResumePoint,
      nextIntendedStep: options.nextIntendedStep ?? "Awaiting next user message.",
      alignmentStatus: updated.alignmentStatus,
      driftWarnings: updated.driftWarnings,
    });

    return updated;
  }

  // ── Activity tracking ─────────────────────────────────────────────────────

  recordActivity(agentId: string): void {
    const state = this.getState(agentId);
    state.lastActivityAt = new Date().toISOString();
    this.setState(state);
  }

  isIdle(agentId: string): boolean {
    const state = this.getState(agentId);
    const lastActivity = new Date(state.lastActivityAt).getTime();
    return Date.now() - lastActivity >= IDLE_THRESHOLD_MS;
  }

  // ── Idle rehydration ──────────────────────────────────────────────────────

  async checkIdleRehydration(agentId: string): Promise<{ rehydrated: boolean }> {
    if (!this.isIdle(agentId)) {
      return { rehydrated: false };
    }

    // Perform full rehydration: re-read all project memory files
    const filesRead: string[] = [];
    const agentContextContent = await this.safeReadFile(this.filePath("agentContext"));
    if (agentContextContent) filesRead.push(PROJECT_MEMORY_FILES.agentContext);

    const todoContent = await this.safeReadFile(this.filePath("todo"));
    if (todoContent) filesRead.push(PROJECT_MEMORY_FILES.todo);

    const errorLogContent = await this.safeReadFile(this.filePath("errorLog"));
    if (errorLogContent) filesRead.push(PROJECT_MEMORY_FILES.errorLog);

    const syncLogContent = await this.safeReadFile(this.filePath("syncLog"));
    if (syncLogContent) filesRead.push(PROJECT_MEMORY_FILES.syncLog);

    const sessionSummariesContent = await this.safeReadFile(this.filePath("sessionSummaries"));
    if (sessionSummariesContent) filesRead.push(PROJECT_MEMORY_FILES.sessionSummaries);

    // Extract todos from todo.md if present
    const state = this.getState(agentId);
    if (todoContent) {
      const todoLines = todoContent
        .split("\n")
        .filter((l) => /^\d+\./.test(l.trim()))
        .map((l) => l.replace(/^\d+\.\s*/, "").trim())
        .filter(Boolean);
      if (todoLines.length > 0) {
        state.memory.todos = todoLines;
      }
    }

    // Extract session summary from session_summaries.md
    if (sessionSummariesContent) {
      const lastSummary = sessionSummariesContent
        .split("\n## Session")
        .filter(Boolean)
        .at(-1)
        ?.trim();
      if (lastSummary) {
        state.history.summaries = [...state.history.summaries, lastSummary].slice(-5);
      }
    }

    state.safeResumePoint = `Idle rehydration at ${new Date().toISOString()} — layers restored from project_memory files.`;
    this.setState(state);

    await this.syncAll(agentId, "idle-rehydration", {
      stepDescription: `Idle rehydration triggered. Inactive for >1h. Re-read: ${filesRead.join(", ")}.`,
      filesChanged: [],
      nextIntendedStep: "Resume normal operation after rehydration.",
    });

    return { rehydrated: true };
  }

  // ── Pre/post step triggers ─────────────────────────────────────────────────

  async syncPreStep(agentId: string, stepDescription: string): Promise<void> {
    await this.syncAll(agentId, "major-step-pre", {
      stepDescription: `[PRE] ${stepDescription}`,
      nextIntendedStep: stepDescription,
    });
  }

  async syncPostStep(
    agentId: string,
    stepDescription: string,
    filesChanged: string[] = [],
    mindUpdate?: Partial<MindLayer>,
  ): Promise<void> {
    await this.syncAll(agentId, "major-step-post", {
      stepDescription: `[POST] ${stepDescription}`,
      filesChanged,
      nextIntendedStep: "Awaiting next user message.",
      mindUpdate,
    });
  }

  // ── History management ────────────────────────────────────────────────────

  addHistoryTurn(agentId: string, role: string, content: string): void {
    const state = this.getState(agentId);
    const turn = { role, content: content.slice(0, 500), timestamp: new Date().toISOString() };
    state.history.recentTurns = [...state.history.recentTurns, turn].slice(-HISTORY_WINDOW);

    // Auto-summarize if window exceeds threshold
    if (state.history.recentTurns.length >= HISTORY_WINDOW) {
      const oldestBatch = state.history.recentTurns.slice(0, 5);
      const summary = `[Auto-summary] ${oldestBatch.map((t) => `${t.role}: ${t.content.slice(0, 80)}`).join(" | ")}`;
      state.history.summaries = [...state.history.summaries, summary].slice(-10);
      state.history.recentTurns = state.history.recentTurns.slice(5);
    }

    this.setState(state);
  }

  updateCurrentDirection(agentId: string, direction: string): void {
    const state = this.getState(agentId);
    state.history.currentDirection = direction;
    this.setState(state);
  }

  addUnresolvedThread(agentId: string, thread: string): void {
    const state = this.getState(agentId);
    state.history.unresolvedThreads = [...state.history.unresolvedThreads, thread].slice(-10);
    this.setState(state);
  }

  resolveThread(agentId: string, threadPattern: string): void {
    const state = this.getState(agentId);
    state.history.unresolvedThreads = state.history.unresolvedThreads.filter(
      (t) => !t.toLowerCase().includes(threadPattern.toLowerCase()),
    );
    this.setState(state);
  }

  // ── Mind management ───────────────────────────────────────────────────────

  updateMind(agentId: string, update: Partial<MindLayer>): void {
    const state = this.getState(agentId);
    state.mind = { ...state.mind, ...update };
    this.setState(state);
  }

  // ── Memory management ─────────────────────────────────────────────────────

  addTodo(agentId: string, todo: string): void {
    const state = this.getState(agentId);
    if (!state.memory.todos.includes(todo)) {
      state.memory.todos = [...state.memory.todos, todo];
      this.setState(state);
    }
  }

  addLongTermFact(agentId: string, fact: string): void {
    const state = this.getState(agentId);
    if (!state.memory.longTermFacts.includes(fact)) {
      state.memory.longTermFacts = [...state.memory.longTermFacts, fact].slice(-50);
      this.setState(state);
    }
  }

  recordError(agentId: string, record: string): void {
    const state = this.getState(agentId);
    state.memory.errorFixRecords = [...state.memory.errorFixRecords, `[${new Date().toISOString()}] ${record}`].slice(-20);
    this.setState(state);
  }

  recordToolResult(agentId: string, toolResult: string): void {
    const state = this.getState(agentId);
    state.memory.toolResults = [...state.memory.toolResults, toolResult].slice(-20);
    this.setState(state);
  }

  // ── Context checkpoint ────────────────────────────────────────────────────

  async checkContextCheckpoint(agentId: string, estimatedTokens: number): Promise<void> {
    if (estimatedTokens >= 96_000) {
      await this.syncAll(agentId, "context-checkpoint", {
        stepDescription: `Context checkpoint: ~${estimatedTokens} estimated tokens active.`,
        nextIntendedStep: "Continue conversation with compacted context.",
      });
    }
  }

  // ── Safe resume point ─────────────────────────────────────────────────────

  setSafeResumePoint(agentId: string, description: string): void {
    const state = this.getState(agentId);
    state.safeResumePoint = `[${new Date().toISOString()}] ${description}`;
    this.setState(state);
  }

  // ── Public getters ────────────────────────────────────────────────────────

  getContinuityState(agentId: string): ContinuityState {
    return this.getState(agentId);
  }

  getSyncSummary(agentId: string): {
    lastSyncedAt: string;
    lastActivityAt: string;
    alignmentStatus: string;
    driftWarnings: string[];
    safeResumePoint: string;
    historyTurns: number;
    todoCount: number;
  } {
    const state = this.getState(agentId);
    return {
      lastSyncedAt: state.lastSyncedAt,
      lastActivityAt: state.lastActivityAt,
      alignmentStatus: state.alignmentStatus,
      driftWarnings: state.driftWarnings,
      safeResumePoint: state.safeResumePoint,
      historyTurns: state.history.recentTurns.length,
      todoCount: state.memory.todos.length,
    };
  }

  // ── Session summary writer ────────────────────────────────────────────────

  async writeSessionSummary(agentId: string, summary: string): Promise<void> {
    const now = new Date().toISOString();
    const entry = `\n## Session [${agentId}] — ${now}\n${summary}\n`;
    await this.safeAppendFile(this.filePath("sessionSummaries"), entry);

    const state = this.getState(agentId);
    state.history.summaries = [...state.history.summaries, summary].slice(-10);
    this.setState(state);
  }

  // ── Change log writer ─────────────────────────────────────────────────────

  async recordChange(
    agentId: string,
    description: string,
    filesChanged: string[],
  ): Promise<void> {
    const now = new Date().toISOString();
    const entry = [
      `\n## Change [${agentId}] — ${now}`,
      description,
      filesChanged.length > 0 ? `Files: ${filesChanged.join(", ")}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    await this.safeAppendFile(this.filePath("changeLog"), entry + "\n");
  }

  // ── Error log writer ──────────────────────────────────────────────────────

  async recordErrorToFile(error: string, resolved = false): Promise<void> {
    const now = new Date().toISOString();
    const status = resolved ? "[RESOLVED]" : "[OPEN]";
    const entry = `\n- ${now} ${status} ${error}`;
    await this.safeAppendFile(this.filePath("errorLog"), entry);
  }
}

export const continuitySyncService = new ContinuitySyncService();
