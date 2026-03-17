"use client";

import { useEffect, useState } from "react";
import { activeAgent, initialChat } from "@/lib/mock/data";
import type { SyncedAgentProfile } from "@/lib/services/agent/agent-profile-sync";
import type { ChatMessageView } from "@/types/domain";

type SyncStatusResponse = {
  summary: {
    lastSyncedAt: string;
    alignmentStatus: string;
  };
  usage: {
    totalTokens: number;
    lastUpdated: string;
  };
  layers: {
    soul: { mission: string };
    identity: { name: string };
    mind: { currentTaskState: string };
    memory: { summaries: string[]; todos: string[] };
    history: { recentTurnCount: number };
  };
};

function initialProfile(): SyncedAgentProfile {
  return {
    agentId: activeAgent.id,
    name: "Atlas",
    roleTitle: activeAgent.identity.roleTitle,
    specialization: "Job search intelligence and outreach support",
    soulMission: activeAgent.soul.mission,
    longTermObjective: "Land high-fit interviews with focused, low-noise actions.",
    principles: activeAgent.soul.principles,
    decisionPhilosophy: "Prioritize evidence-backed opportunities and avoid noisy actions.",
    communicationStyle: activeAgent.identity.communicationStyle,
    personalityStyle: activeAgent.identity.communicationStyle,
    mindModel: activeAgent.mind.model,
    mindConstraints: ["Do not fabricate facts", "Always stay within user-approved actions"],
    memoryAnchors: "Prefer high-fit roles and concise updates.",
  };
}

export function AgentChatStarter() {
  const [messages, setMessages] = useState<ChatMessageView[]>(initialChat);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showToolUse, setShowToolUse] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [sessions, setSessions] = useState<Array<{ id: string; title: string }>>([]);
  const [onboardingComplete, setOnboardingComplete] = useState(activeAgent.onboardingCompleted);
  const [profile, setProfile] = useState<SyncedAgentProfile>(initialProfile);
  const [syncStatus, setSyncStatus] = useState<SyncStatusResponse | null>(null);

  useEffect(() => {
    const bottom = document.getElementById("chat-bottom");
    if (bottom) {
      bottom.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  useEffect(() => {
    let ignore = false;

    async function loadSyncStatus() {
      try {
        const response = await fetch("/api/agents/sync-status?agentId=atlas");
        const payload = (await response.json()) as SyncStatusResponse;
        if (!ignore) {
          setSyncStatus(payload);
        }
      } catch {
        if (!ignore) {
          setSyncStatus(null);
        }
      }
    }

    async function loadSessions() {
      try {
        // Use agentId from profile which is derived from activeAgent
        const response = await fetch(`/api/agents/sessions?agentId=${activeAgent.id}`);
        const payload = (await response.json()) as { sessions: Array<{ id: string; title: string }> };
        if (!ignore) {
          console.log("Loaded sessions:", payload.sessions);
          setSessions(payload.sessions || []);
        }
      } catch (error) {
        console.error("Failed to load sessions:", error);
      }
    }

    void loadSyncStatus();
    void loadSessions();
    const interval = window.setInterval(() => {
      void loadSyncStatus();
    }, 60_000);

    return () => {
      ignore = true;
      window.clearInterval(interval);
    };
  }, []);

  async function switchSession(id: string) {
    if (id === "new") {
      setSessionId(undefined);
      setMessages(initialChat);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/agents/sessions?sessionId=${id}`);
      const payload = (await response.json()) as { messages: Array<{ role: string; content: string; createdAt: string }> };
      const formatted = payload.messages.map((m) => ({
        id: crypto.randomUUID(),
        role: m.role as "USER" | "ASSISTANT",
        content: m.content,
        createdAt: m.createdAt,
      }));
      setMessages(formatted.length > 0 ? formatted : initialChat);
      setSessionId(id);
    } catch {
      // error handling
    } finally {
      setLoading(false);
    }
  }

  async function sendMessage() {
    if (!input.trim()) {
      return;
    }

    const userMessage: ChatMessageView = {
      id: crypto.randomUUID(),
      role: "USER",
      content: input,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/agents/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: activeAgent.id,
          sessionId,
          message: userMessage.content,
        }),
      });

      const payload = (await response.json()) as {
        reply: string;
        sessionId?: string;
        onboardingCompleted?: boolean;
        profileSnapshot?: SyncedAgentProfile;
        toolLogs?: Array<{ tool: string; parameters: any; result: string }>;
      };
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "ASSISTANT",
          content: payload.reply,
          createdAt: new Date().toISOString(),
          ...({ toolLogs: payload.toolLogs } as any),
        },
      ]);
      
      const newSessionId = payload.sessionId ?? sessionId;
      if (newSessionId !== sessionId) {
        setSessionId(newSessionId);
        // Refresh sessions list
        const sessionsRes = await fetch(`/api/agents/sessions?agentId=${activeAgent.id}`);
        const sessionsData = await sessionsRes.json();
        setSessions(sessionsData.sessions || []);
      }

      setSessionId((prev) => payload.sessionId ?? prev);
      setOnboardingComplete((prev) => payload.onboardingCompleted ?? prev);
      if (payload.profileSnapshot) {
        setProfile(payload.profileSnapshot);
      }
    } finally {
      setLoading(false);
    }
  }

  const lastSyncedLabel = syncStatus
    ? `${Math.max(0, Math.round((Date.now() - new Date(syncStatus.summary.lastSyncedAt).getTime()) / 60000))} minutes ago`
    : "Unavailable";

  const layerStatuses = syncStatus
    ? [
        { label: "Soul", healthy: Boolean(syncStatus.layers.soul.mission) },
        { label: "Identity", healthy: Boolean(syncStatus.layers.identity.name) },
        { label: "Mind", healthy: Boolean(syncStatus.layers.mind.currentTaskState) },
        { label: "Memory", healthy: syncStatus.layers.memory.summaries.length > 0 || syncStatus.layers.memory.todos.length >= 0 },
        { label: "History", healthy: syncStatus.layers.history.recentTurnCount >= 0 },
      ]
    : [
        { label: "Soul", healthy: false },
        { label: "Identity", healthy: false },
        { label: "Mind", healthy: false },
        { label: "Memory", healthy: false },
        { label: "History", healthy: false },
      ];

  return (
    <div className="flex flex-1 h-full max-h-full min-h-0 flex-col gap-5 overflow-hidden xl:flex-row">
      <aside className="panel flex min-h-0 flex-col overflow-y-auto p-5 xl:w-[320px] xl:flex-none custom-scrollbar">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">Agent Profile</p>
        <h3 className="mt-2 text-2xl font-extrabold">{profile.name}</h3>
        <p className="mt-1 text-sm text-muted">{profile.roleTitle}</p>
        
        <div className="mt-4 flex-1 space-y-2 text-sm">
          <p>
            <span className="font-semibold">Soul Mission:</span> {profile.soulMission}
          </p>
          <p>
            <span className="font-semibold">Style:</span> {profile.communicationStyle}
          </p>
          <p>
            <span className="font-semibold">Mind Model:</span> {profile.mindModel}
          </p>
          <p>
            <span className="font-semibold">Memory Anchor:</span> {profile.memoryAnchors}
          </p>
        </div>

        <div className="mt-5 rounded-xl border border-white/60 bg-white/75 p-3 text-xs">
          <div className="flex items-center justify-between">
            <p className="font-semibold">Tool Use</p>
            <button
              onClick={() => setShowToolUse(!showToolUse)}
              className={`px-2 py-1 rounded-md transition-all font-bold ${
                showToolUse ? "bg-cyan-600 text-white" : "bg-white/50 text-muted border border-white/60 hover:bg-white"
              }`}
            >
              {showToolUse ? "Hide Logs" : "Show Logs"}
            </button>
          </div>
          <p className="mt-1 text-[10px] text-muted leading-tight italic">Expose technical tool results and orchestrator calls.</p>
        </div>

        <div className="mt-4 rounded-xl border border-white/60 bg-white/75 p-3 text-xs">
          <p className="font-semibold">Token Usage</p>
          <p className="mt-1 text-muted">Total tokens used: {syncStatus?.usage.totalTokens.toLocaleString() ?? 0}</p>
          <p className="text-[10px] text-muted/60 italic leading-tight mt-1">Estimates based on cumulative provider sessions.</p>
        </div>

        <div className="mt-4 rounded-xl border border-white/60 bg-white/75 p-3 text-xs">
          <p className="font-semibold">Memory Health</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {layerStatuses.map((layer) => (
              <p key={layer.label} className="flex items-center gap-2 text-muted">
                <span className={layer.healthy ? "text-emerald-600" : "text-rose-600"}>{layer.healthy ? "✓" : "✗"}</span>
                <span>{layer.label}</span>
              </p>
            ))}
          </div>
          <p className="mt-2 text-muted">Last synced: {lastSyncedLabel}</p>
        </div>
      </aside>

      <section className="panel flex min-h-0 flex-1 flex-col overflow-hidden p-4">
        {/* Chat Header with Session Management */}
        <div className="mb-4 flex flex-none items-center justify-between gap-4">
          <div className="flex flex-1 items-center gap-2 overflow-hidden">
            <select
              value={sessionId || "new"}
              onChange={(e) => void switchSession(e.target.value)}
              className="field text-xs font-medium bg-white/50 py-1.5 focus:bg-white"
            >
              <option value="new">Current Conversation</option>
              {sessions?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title || "Untitled Conversation"}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => void switchSession("new")}
            className="btn-secondary whitespace-nowrap px-3 py-1.5 text-xs flex items-center gap-1.5"
          >
            <span className="text-base leading-none font-bold">+</span>
            New Chat
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto rounded-xl border border-white/60 bg-white/75 p-3 custom-scrollbar">
          <div className="space-y-3 pb-2">
            {messages.map((message) => (
              <div key={message.id} className="space-y-2">
                {/* Internal Tool Logs */}
                {showToolUse && (message as any).toolLogs?.length > 0 && (
                  <div className="mx-4 rounded-lg border border-dashed border-cyan-500/30 bg-cyan-500/5 p-2 text-[10px] font-mono text-cyan-700/70 max-h-[200px] overflow-y-auto custom-scrollbar">
                    <p className="mb-1 uppercase tracking-wider font-bold sticky top-0 bg-white/80 backdrop-blur-sm p-1 z-10">Internal Operator Logs:</p>
                    {(message as any).toolLogs.map((log: any, idx: number) => (
                      <div key={idx} className="mb-2 last:mb-0 border-l-2 border-cyan-500/20 pl-2">
                        <p className="font-bold">→ Executed: {log.tool}</p>
                        <p className="mt-0.5 opacity-80 italic">Params: {JSON.stringify(log.parameters)}</p>
                        <div className="mt-1 bg-white/30 p-1 rounded overflow-x-auto max-h-24">
                          {log.result}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm shadow-sm leading-relaxed ${
                    message.role === "USER"
                      ? "ml-auto bg-gradient-to-br from-cyan-600 to-cyan-700 text-white"
                      : "border border-white/60 bg-white/90"
                  }`}
                >
                  {message.content}
                </div>
              </div>
            ))}
            {loading ? (
              <div className="flex items-center gap-2 pl-2">
                <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-600" />
                <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-600 [animation-delay:-0.15s]" />
                <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-600 [animation-delay:-0.3s]" />
                <p className="text-xs text-muted italic">Atlas is processing...</p>
              </div>
            ) : null}
            <div id="chat-bottom" className="h-2" />
          </div>
        </div>

        <div className="mt-4 flex-none flex items-center gap-2 rounded-2xl border border-white/60 bg-white/80 p-3 shadow-sm transition-all duration-300 focus-within:ring-1 focus-within:ring-cyan-500/30">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !loading && input.trim()) {
                event.preventDefault();
                void sendMessage();
              }
            }}
            placeholder="Type a message..."
            className="field flex-1 bg-transparent border-none shadow-none focus:ring-0"
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="btn-primary disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </section>

    </div>
  );
}
