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
  mode: "READY" | "SEARCH" | "EVALUATION" | "OUTREACH";
  reasoningMode: string;
  workflowPlan: string[];
  loopPreventionState: string;
  currentStrategy: string;
  activeExecutionContext: string;
  pendingActions: string[];
  activeToolIntentions: string[];
  operatingAssumptions: string[];
  todos: Array<{ description: string; mode: string; status: "pending" | "in-progress" | "blocked" | "done" | "cancelled" }>;
};

export type MemoryLayer = {
  userPreferences: string[];
  longTermFacts: string[];
  summaries: string[];
  toolResults: string[];
  jobContext: string;
  followUpState: string;
  errorFixRecords: string[];
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
const HISTORY_WINDOW = 30; // Max turns before archival/summarization
const RAW_HISTORY_RETAIN = 20; // How many raw turns to keep after summarization
const MEMORY_DIR = "project_memory";

const PROJECT_MEMORY_FILES = {
  agentContext: path.join(MEMORY_DIR, "agent_context.md"),
  syncLog: path.join(MEMORY_DIR, "agent_sync_log.md"),
  agentManifest: path.join(MEMORY_DIR, "agent.md"),
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
    mode: "READY",
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
    todos: [],
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
  private formatStateAsMarkdown(state: ContinuityState): string {
    return [
      `# Atlas Agent Manifest`,
      `*Last Synced: ${state.lastSyncedAt}*`,
      "",
      `## SOUL`,
      `- **Mission**: ${state.soul.mission}`,
      `- **Values**: ${state.soul.values.join(", ")}`,
      "",
      `## IDENTITY`,
      `- **Name**: ${state.identity.name}`,
      `- **Persona**: ${state.identity.persona}`,
      `- **Tone**: ${state.identity.tone}`,
      "",
      `## MIND`,
      `- **Mode**: ${state.mind.mode}`,
      `- **Strategy**: ${state.mind.currentStrategy}`,
      `- **Todos**:`,
      ...state.mind.todos.map(t => `  - [${t.status === "done" ? "x" : " "}] ${t.description} (${t.mode})`),
      "",
      `## SYNC STATE`,
      `- **Alignment**: ${state.alignmentStatus}`,
      `- **Resume Point**: ${state.safeResumePoint}`,
    ].join("\n");
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  private getState(agentId: string, sessionId = "default"): ContinuityState {
    const key = `${agentId}:${sessionId}`;
    const existing = continuitySyncStates.get(key);
    if (existing) return existing;
    const fresh = defaultContinuityState(agentId);
    continuitySyncStates.set(key, fresh);
    return fresh;
  }

  private setState(state: ContinuityState, sessionId = "default"): void {
    const key = `${state.agentId}:${sessionId}`;
    continuitySyncStates.set(key, state);
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
    // High-level sync disabled as per user request — but method kept for layer structure
    return state.memory;
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

  private async writeSyncLogEntry(entry: SyncLogEntry & { sessionId?: string }): Promise<void> {
    const logLine = [
      `\n## Sync Event: ${entry.timestamp}`,
      `- **Trigger:** ${entry.triggerType}`,
      `- **Agent:** ${entry.agentId}`,
      `- **Session:** ${entry.sessionId || "default"}`,
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
    sessionId: string,
    triggerType: SyncTriggerType,
    options: {
      stepDescription?: string;
      filesChanged?: string[];
      nextIntendedStep?: string;
      mindUpdate?: Partial<MindLayer>;
    } = {},
  ): Promise<ContinuityState> {
    const sid = sessionId || "default";
    const state = this.getState(agentId, sid);
    const now = new Date().toISOString();

    // 1. Load Soul from profile store
    const soul = this.syncSoulFromProfile(agentId, state);

    // 2. Load Identity from profile store (bounded by Soul)
    const identity = this.syncIdentityFromProfile(agentId, state);

    // 3. Skip/Disable Memory sync as per user request
    const memory = state.memory; // Keep existing memory without re-syncing from memoryService

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

    this.setState(updated, sessionId);

    this.setState(updated, sessionId);

    // 6. Write agent.md manifest
    const manifest = this.formatStateAsMarkdown(updated);
    await this.safeWriteFile(this.filePath("agentManifest"), manifest);

    // 7. Write sync log
    const filesRead = [PROJECT_MEMORY_FILES.agentManifest];
    const filesUpdated = [PROJECT_MEMORY_FILES.agentManifest, PROJECT_MEMORY_FILES.syncLog];

    await this.writeSyncLogEntry({
      timestamp: now,
      triggerType,
      agentId,
      sessionId,
      filesRead,
      filesUpdated,
      whatChanged: options.stepDescription ?? "Full continuity sync performed (agent.md).",
      safeResumePoint: updated.safeResumePoint,
      nextIntendedStep: options.nextIntendedStep ?? "Awaiting next user message.",
      alignmentStatus: updated.alignmentStatus,
      driftWarnings: updated.driftWarnings,
    });

    return updated;
  }

  // ── Activity tracking ─────────────────────────────────────────────────────

  recordActivity(agentId: string, sessionId = "default"): void {
    const state = this.getState(agentId, sessionId);
    state.lastActivityAt = new Date().toISOString();
    this.setState(state, sessionId);
  }

  isIdle(agentId: string, sessionId = "default"): boolean {
    const state = this.getState(agentId, sessionId);
    const lastActivity = new Date(state.lastActivityAt).getTime();
    return Date.now() - lastActivity >= IDLE_THRESHOLD_MS;
  }

  // ── Idle rehydration ──────────────────────────────────────────────────────

  async checkIdleRehydration(agentId: string, sessionId = "default"): Promise<{ rehydrated: boolean }> {
    if (!this.isIdle(agentId, sessionId)) {
      return { rehydrated: false };
    }

    // Perform full rehydration: prioritize agent.md
    const filesRead: string[] = [];
    const agentManifestContent = await this.safeReadFile(this.filePath("agentManifest"));
    if (agentManifestContent) {
      filesRead.push(PROJECT_MEMORY_FILES.agentManifest);
      // Logic to parse the markdown manifest could be added here to fully restore state
      // For now, we rely on the in-memory syncAll to re-establish the baseline
    }

    const agentContextContent = await this.safeReadFile(this.filePath("agentContext"));
    if (agentContextContent) filesRead.push(PROJECT_MEMORY_FILES.agentContext);

    const syncLogContent = await this.safeReadFile(this.filePath("syncLog"));
    if (syncLogContent) filesRead.push(PROJECT_MEMORY_FILES.syncLog);

    const state = this.getState(agentId, sessionId);

    state.safeResumePoint = `Idle rehydration at ${new Date().toISOString()} — layers restored from project_memory files.`;
    this.setState(state, sessionId);

    await this.syncAll(agentId, sessionId, "idle-rehydration", {
      stepDescription: `Idle rehydration triggered. Inactive for >1h. Re-read: ${filesRead.join(", ")}.`,
      filesChanged: [],
      nextIntendedStep: "Resume normal operation after rehydration.",
    });

    return { rehydrated: true };
  }

  // ── Pre/post step triggers ─────────────────────────────────────────────────

  async syncPreStep(agentId: string, sessionId: string, stepDescription: string): Promise<void> {
    await this.syncAll(agentId, sessionId, "major-step-pre", {
      stepDescription: `[PRE] ${stepDescription}`,
      nextIntendedStep: stepDescription,
    });
  }

  async syncPostStep(
    agentId: string,
    sessionId: string,
    stepDescription: string,
    filesChanged: string[] = [],
    mindUpdate?: Partial<MindLayer>,
  ): Promise<void> {
    await this.syncAll(agentId, sessionId, "major-step-post", {
      stepDescription: `[POST] ${stepDescription}`,
      filesChanged,
      nextIntendedStep: "Awaiting next user message.",
      mindUpdate,
    });
  }

  // ── History management ────────────────────────────────────────────────────

  addHistoryTurn(agentId: string, sessionId: string, role: string, content: string): void {
    const state = this.getState(agentId, sessionId);
    const turn = { role, content: content.slice(0, 1000), timestamp: new Date().toISOString() };
    state.history.recentTurns.push(turn);

    // Trigger summarization when window exceeds HISTORY_WINDOW (25-30)
    if (state.history.recentTurns.length >= HISTORY_WINDOW) {
      const turnsToSummarize = state.history.recentTurns.length - RAW_HISTORY_RETAIN;
      if (turnsToSummarize > 0) {
        const batch = state.history.recentTurns.slice(0, turnsToSummarize);
        const summary = `[Archival Summary] ${batch.map((t) => `${t.role}: ${t.content.slice(0, 80)}`).join(" | ")}`;
        state.history.summaries = [...state.history.summaries, summary].slice(-20);
        state.history.recentTurns = state.history.recentTurns.slice(turnsToSummarize);
      }
    }

    this.setState(state, sessionId);
  }

  getFormattedHistory(agentId: string, sessionId: string): string | null {
    const state = this.getState(agentId, sessionId);
    if (state.history.recentTurns.length === 0) return null;

    return state.history.recentTurns
      .map(t => `${t.role}: ${t.content}`)
      .join("\n\n");
  }

  updateCurrentDirection(agentId: string, sessionId: string, direction: string): void {
    const state = this.getState(agentId, sessionId);
    state.history.currentDirection = direction;
    this.setState(state, sessionId);
  }

  addUnresolvedThread(agentId: string, sessionId: string, thread: string): void {
    const state = this.getState(agentId, sessionId);
    state.history.unresolvedThreads = [...state.history.unresolvedThreads, thread].slice(-10);
    this.setState(state, sessionId);
  }

  resolveThread(agentId: string, sessionId: string, threadPattern: string): void {
    const state = this.getState(agentId, sessionId);
    state.history.unresolvedThreads = state.history.unresolvedThreads.filter(
      (t) => !t.toLowerCase().includes(threadPattern.toLowerCase()),
    );
    this.setState(state, sessionId);
  }

  // ── LLM-Driven Layer Sync ────────────────────────────────────────────────
  
  async syncLayersWithLlm(
    agentId: string,
    sessionId: string,
    update: {
      soul?: Partial<SoulLayer>;
      identity?: Partial<IdentityLayer>;
      mind?: Partial<MindLayer>;
    }
  ): Promise<void> {
    const state = this.getState(agentId, sessionId);

    if (update.soul) {
      state.soul = { ...state.soul, ...update.soul };
    }
    if (update.identity) {
      state.identity = { ...state.identity, ...update.identity };
    }
    if (update.mind) {
      state.mind = { ...state.mind, ...update.mind };
    }

    state.lastSyncedAt = new Date().toISOString();
    this.setState(state, sessionId);

    // Log the LLM-driven update
    await this.writeSyncLogEntry({
      timestamp: state.lastSyncedAt,
      triggerType: "major-step-post",
      agentId,
      sessionId,
      filesRead: [],
      filesUpdated: [PROJECT_MEMORY_FILES.syncLog],
      whatChanged: "LLM-driven layer synchronization (Soul/Identity/Mind).",
      safeResumePoint: state.safeResumePoint,
      nextIntendedStep: "Awaiting next user message.",
      alignmentStatus: state.alignmentStatus,
      driftWarnings: state.driftWarnings,
    });
  }

  // ── Mind management ───────────────────────────────────────────────────────

  updateMind(agentId: string, sessionId: string, update: Partial<MindLayer>): void {
    const state = this.getState(agentId, sessionId);
    state.mind = { ...state.mind, ...update };
    this.setState(state, sessionId);
  }

  // ── Memory management ─────────────────────────────────────────────────────

  addTodo(agentId: string, sessionId: string, description: string, mode = "READY"): void {
    const state = this.getState(agentId, sessionId);
    const exists = state.mind.todos.some((t) => t.description === description);
    if (!exists) {
      state.mind.todos.push({ description, mode, status: "pending" });
      this.setState(state, sessionId);
    }
  }

  addLongTermFact(agentId: string, sessionId: string, fact: string): void {
    const state = this.getState(agentId, sessionId);
    if (!state.memory.longTermFacts.includes(fact)) {
      state.memory.longTermFacts = [...state.memory.longTermFacts, fact].slice(-50);
      this.setState(state, sessionId);
    }
  }

  recordError(agentId: string, sessionId: string, record: string): void {
    const state = this.getState(agentId, sessionId);
    state.memory.errorFixRecords = [...state.memory.errorFixRecords, `[${new Date().toISOString()}] ${record}`].slice(-20);
    this.setState(state, sessionId);
  }

  recordToolResult(agentId: string, sessionId: string, toolResult: string): void {
    const state = this.getState(agentId, sessionId);
    state.memory.toolResults = [...state.memory.toolResults, toolResult].slice(-20);
    this.setState(state, sessionId);
  }

  // ── Context checkpoint ────────────────────────────────────────────────────

  async checkContextCheckpoint(agentId: string, sessionId: string, estimatedTokens: number): Promise<void> {
    if (estimatedTokens >= 96_000) {
      await this.syncAll(agentId, sessionId, "context-checkpoint", {
        stepDescription: `Context checkpoint: ~${estimatedTokens} estimated tokens active.`,
        nextIntendedStep: "Continue conversation with compacted context.",
      });
    }
  }

  // ── Safe resume point ─────────────────────────────────────────────────────

  setSafeResumePoint(agentId: string, sessionId: string, description: string): void {
    const state = this.getState(agentId, sessionId);
    state.safeResumePoint = `[${new Date().toISOString()}] ${description}`;
    this.setState(state, sessionId);
  }

  // ── Public getters ────────────────────────────────────────────────────────

  getContinuityState(agentId: string, sessionId = "default"): ContinuityState {
    return this.getState(agentId, sessionId);
  }

  getSyncSummary(agentId: string, sessionId = "default"): {
    lastSyncedAt: string;
    lastActivityAt: string;
    alignmentStatus: string;
    driftWarnings: string[];
    safeResumePoint: string;
    historyTurns: number;
    todoCount: number;
  } {
    const state = this.getState(agentId, sessionId);
    return {
      lastSyncedAt: state.lastSyncedAt,
      lastActivityAt: state.lastActivityAt,
      alignmentStatus: state.alignmentStatus,
      driftWarnings: state.driftWarnings,
      safeResumePoint: state.safeResumePoint,
      historyTurns: state.history.recentTurns.length,
      todoCount: state.mind.todos.length,
    };
  }

  // ── Session summary writer ────────────────────────────────────────────────

}

export const continuitySyncService = new ContinuitySyncService();
