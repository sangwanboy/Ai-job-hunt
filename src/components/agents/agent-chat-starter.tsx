"use client";

import { useEffect, useState, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
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

  const searchParams = useSearchParams();
  const router = useRouter();
  const urlSessionId = searchParams?.get("sessionId") || undefined;

  useEffect(() => {
    const bottom = document.getElementById("chat-bottom");
    if (bottom) {
      bottom.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Effect 1: Loading Sessions (run once on mount or when url changes)
  useEffect(() => {
    let ignore = false;
    async function loadSessions() {
      try {
        const response = await fetch(`/api/agents/sessions?agentId=${activeAgent.id}`);
        const payload = (await response.json()) as { sessions: Array<{ id: string; title: string }> };
        if (!ignore) {
          const loadedSessions = payload.sessions || [];
          setSessions(loadedSessions);
          
          // Auto-load most recent if we have no sessionId and no urlSessionId
          if (!urlSessionId && !sessionId && loadedSessions.length > 0) {
            void switchSession(loadedSessions[0].id);
          }
        }
      } catch (error) {
        console.error("Failed to load sessions:", error);
      }
    }
    void loadSessions();
    return () => { ignore = true; };
  }, []);

  // Effect 2: Loading Sync Status (reaction to active session)
  useEffect(() => {
    let ignore = false;
    async function loadSyncStatus() {
      const targetSid = sessionId || urlSessionId || "default";
      try {
        const response = await fetch(`/api/agents/sync-status?agentId=atlas&sessionId=${targetSid}`);
        const payload = (await response.json()) as SyncStatusResponse;
        if (!ignore) setSyncStatus(payload);
      } catch {
        if (!ignore) setSyncStatus(null);
      }
    }

    void loadSyncStatus();
    const interval = window.setInterval(loadSyncStatus, 20_000); // 20s for better feedback
    return () => {
      ignore = true;
      window.clearInterval(interval);
    };
  }, [sessionId, urlSessionId]);

  // Effect 3: URL Synchronization
  useEffect(() => {
    if (urlSessionId && urlSessionId !== sessionId) {
      void switchSession(urlSessionId);
    }
  }, [urlSessionId]);

  async function switchSession(id: string) {
    if (id === "new") {
      setSessionId(undefined);
      setMessages(initialChat);
      router.push("/agents/workspace");
      return;
    }
    
    // Prevent redundant loading if already on this session
    if (id === sessionId && messages.length > initialChat.length) {
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
      router.push(`/agents/workspace?sessionId=${id}`);
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
    
    // Pulse effect for sync status while loading new session data
    setSyncStatus(null);

    try {
      const response = await fetch("/api/agents/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: activeAgent.id,
          sessionId,
          message: userMessage.content,
          userId: "local-dev-user", // Explicitly pass for fallback tracking
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
        if (newSessionId) {
          router.push(`/agents/workspace?sessionId=${newSessionId}`);
        }
        // Refresh sessions list
        const sessionsRes = await fetch(`/api/agents/sessions?agentId=${activeAgent.id}`);
        const sessionsData = await sessionsRes.json();
        setSessions(sessionsData.sessions || []);
      }

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
    : "Syncing...";

  const layerStatuses = syncStatus
    ? [
        { label: "Soul", healthy: Boolean(syncStatus.layers.soul.mission) },
        { label: "Identity", healthy: Boolean(syncStatus.layers.identity.name) },
        { label: "Mind", healthy: Boolean(syncStatus.layers.mind.currentTaskState) },
        { label: "History", healthy: syncStatus.layers.history.recentTurnCount >= 0 },
      ]
    : [
        { label: "Soul", healthy: false },
        { label: "Identity", healthy: false },
        { label: "Mind", healthy: false },
        { label: "History", healthy: false },
      ];

  return (
    <div className="flex h-full min-h-0 w-full gap-5 overflow-hidden xl:flex-row flex-col lg:gap-6">
      <aside className="panel flex flex-col xl:w-[320px] xl:flex-none p-5 custom-scrollbar scroll-well overflow-y-auto max-h-[40vh] xl:max-h-full">
        <div className="flex-none pb-2 border-b border-white/20">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">Agent Profile</p>
          <h3 className="mt-2 text-2xl font-extrabold">{profile.name}</h3>
          <p className="mt-1 text-sm text-muted">{profile.roleTitle}</p>
        </div>
        
        <div className="flex-none space-y-4 py-4 text-sm">
          <div>
            <span className="font-semibold block mb-1">Soul Mission:</span>
            <p className="text-muted leading-tight">{profile.soulMission}</p>
          </div>
          <div>
            <span className="font-semibold block mb-1">Style:</span>
            <p className="text-muted leading-tight">{profile.communicationStyle}</p>
          </div>
          <div>
            <span className="font-semibold block mb-1">Mind Model:</span>
            <p className="text-muted leading-tight">{profile.mindModel}</p>
          </div>
          <div>
            <span className="font-semibold block mb-1">Memory Anchor:</span>
            <p className="text-muted leading-tight">{profile.memoryAnchors}</p>
          </div>
        </div>

        <div className="flex-none pt-4 border-t border-white/20 space-y-3">
          <div className="rounded-xl border border-white/60 bg-white/75 p-3 text-xs">
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

          <div className="rounded-xl border border-white/60 bg-white/75 p-3 text-xs">
            <p className="font-semibold">Token Usage</p>
            <p className="mt-1 text-muted">Total tokens used: {syncStatus?.usage.totalTokens.toLocaleString() ?? 0}</p>
          </div>

          <div className="rounded-xl border border-white/60 bg-white/75 p-3 text-xs">
            <p className="font-semibold mb-2">Memory Health</p>
            {!syncStatus ? (
              <div className="space-y-2 animate-pulse">
                <div className="h-3 w-3/4 bg-slate-200 rounded" />
                <div className="h-3 w-1/2 bg-slate-200 rounded" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {layerStatuses.map((layer) => (
                    <p key={layer.label} className="flex items-center gap-2 text-muted">
                      <span className={layer.healthy ? "text-emerald-600" : "text-rose-600 font-bold"}>{layer.healthy ? "✓" : "✗"}</span>
                      <span>{layer.label}</span>
                    </p>
                  ))}
                </div>
                <p className="mt-2 text-[10px] text-muted border-t border-white/40 pt-2 italic">Last synced: {lastSyncedLabel}</p>
              </>
            )}
          </div>
        </div>
      </aside>

      <section className="panel flex h-full min-h-0 flex-1 flex-col overflow-hidden p-4 md:p-5 pb-3 md:pb-4 shadow-well">
        {/* Chat Header with Session Management */}
        <div className="mb-4 flex flex-none items-center justify-between gap-4 border-b border-white/20 pb-4">
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

        <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-4 pb-0 custom-scrollbar scroll-well shadow-well relative">
          <div className="flex flex-col gap-4 pb-4">
            {messages.map((message) => (
              <div key={message.id} className="space-y-2">
                {/* Internal Tool Logs */}
                {showToolUse && (message as any).toolLogs?.length > 0 && (
                  <div className="mx-4 rounded-lg border border-dashed border-cyan-500/30 bg-cyan-500/5 p-2 text-[10px] font-mono text-cyan-700/70 max-h-[200px] overflow-y-auto break-all custom-scrollbar">
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
                  className={`max-w-[85%] rounded-xl px-4 py-2 text-sm shadow-sm leading-relaxed whitespace-pre-wrap break-words overflow-hidden ${
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
          </div>
          <div id="chat-bottom" className="h-px w-full opacity-0" />
        </div>

        <div className="mt-2 flex-none flex items-center gap-2 rounded-2xl border border-white/60 bg-white/80 p-3 shadow-sm transition-all duration-300 focus-within:ring-1 focus-within:ring-cyan-500/30">
          <input
            autoFocus
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
