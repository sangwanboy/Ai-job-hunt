"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
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
    agent: { mode: string };
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

let cachedSessions: Array<{ id: string; title: string }> | null = null;
let cachedSessionId: string | null = null;
let cachedMessages: ChatMessageView[] | null = null;

export function AgentChatStarter() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlSessionId = searchParams?.get("sessionId") || undefined;
  
  // If URL explicitly requests a different session than our cache, we ignore local cached messages
  const ignoreCache = urlSessionId && urlSessionId !== cachedSessionId;
  const initSessionId = urlSessionId || cachedSessionId || undefined;

  const [messages, setMessages] = useState<ChatMessageView[]>(ignoreCache ? initialChat : (cachedMessages ?? initialChat));
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showToolUse, setShowToolUse] = useState(true);
  const [sessionId, setSessionId] = useState<string | undefined>(initSessionId);
  const [sessions, setSessions] = useState<Array<{ id: string; title: string }>>(cachedSessions ?? []);
  const [onboardingComplete, setOnboardingComplete] = useState(activeAgent.onboardingCompleted);
  const [profile, setProfile] = useState<SyncedAgentProfile>(initialProfile);
  const [syncStatus, setSyncStatus] = useState<SyncStatusResponse | null>(null);
  const [pendingJobs, setPendingJobs] = useState<Array<{ title: string; company: string; location: string; url: string; salary?: string; source?: string; description?: string; skills?: string; datePosted?: string }> | null>(null);
  const [importingJobs, setImportingJobs] = useState(false);

  /* Bug 10: Track when user explicitly starts a new chat to prevent auto-loading */
  const newChatRef = useRef(false);
  // Do not show the skeleton if we already hit the cache successfully
  const [initialLoading, setInitialLoading] = useState(ignoreCache || (!urlSessionId && !cachedSessionId));
  const [loadingTextIndex, setLoadingTextIndex] = useState(0);

  const processingSteps = [
    "Atlas is organizing the search strategy...",
    "Browsing target job websites...",
    "Extracting page job listings...",
    "Analyzing roles and requirements...",
    "Formulating response..."
  ];

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (loading && !importingJobs && !initialLoading) {
      setLoadingTextIndex(0);
      interval = setInterval(() => {
        setLoadingTextIndex((prev) => Math.min(prev + 1, processingSteps.length - 1));
      }, 4000);
    }
    return () => clearInterval(interval);
  }, [loading, importingJobs, initialLoading]);

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
          cachedSessions = loadedSessions;
          
          // Auto-load most recent if we have no sessionId and no urlSessionId and no cache
          if (!urlSessionId && !sessionId && loadedSessions.length > 0 && !newChatRef.current && !cachedSessionId) {
            void switchSession(loadedSessions[0].id);
          } else if (!urlSessionId && !cachedSessionId) {
            setInitialLoading(false);
          } else {
            // Already initialized from cache
            setInitialLoading(false);
          }
        }
      } catch (error) {
        console.error("Failed to load sessions:", error);
        if (!ignore) setInitialLoading(false);
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
      newChatRef.current = true;
      setSessionId(undefined);
      cachedSessionId = null;
      setMessages(initialChat);
      cachedMessages = null;
      setPendingJobs(null);
      router.push("/agents/workspace");
      return;
    }
    newChatRef.current = false;
    
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
      cachedMessages = formatted.length > 0 ? formatted : initialChat;
      setSessionId(id);
      cachedSessionId = id;
      setPendingJobs(null);
      router.push(`/agents/workspace?sessionId=${id}`);
    } catch {
      // error handling
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  }

  async function sendMessage(overrideMessage?: string) {
    const msg = overrideMessage || input.trim();
    if (!msg) {
      return;
    }

    const userMessage: ChatMessageView = {
      id: crypto.randomUUID(),
      role: "USER",
      content: msg,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => {
      const next = [...prev, userMessage];
      cachedMessages = next;
      return next;
    });
    if (!overrideMessage) setInput("");
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
          message: msg,
          userId: "local-dev-user", // Explicitly pass for fallback tracking
        }),
      });

      const payload = (await response.json()) as {
        reply: string;
        sessionId?: string;
        onboardingCompleted?: boolean;
        profileSnapshot?: SyncedAgentProfile;
        toolLogs?: Array<{ tool: string; parameters: any; result: string }>;
        pendingJobs?: Array<{ title: string; company: string; location: string; url: string; salary?: string; source?: string }> | null;
      };
      setMessages((prev) => {
        const next: ChatMessageView[] = [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "ASSISTANT",
            content: payload.reply,
            createdAt: new Date().toISOString(),
            ...({ toolLogs: payload.toolLogs } as any),
          },
        ];
        cachedMessages = next;
        return next;
      });
      
      // Handle pending jobs for preview
      if (payload.pendingJobs && payload.pendingJobs.length > 0) {
        setPendingJobs(payload.pendingJobs);
      } else {
        setPendingJobs(null);
      }
      
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

  async function handleImportAll() {
    setImportingJobs(true);
    setPendingJobs(null);
    await sendMessage("Import all previewed jobs to my pipeline");
    setImportingJobs(false);
  }

  async function handleDismissJobs() {
    setPendingJobs(null);
    const dismissMsg: ChatMessageView = {
      id: crypto.randomUUID(),
      role: "USER",
      content: "Dismiss previewed jobs",
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, dismissMsg]);
    const assistantMsg: ChatMessageView = {
      id: crypto.randomUUID(),
      role: "ASSISTANT",
      content: "No problem — previewed jobs have been dismissed. Let me know if you'd like to search again or try different criteria.",
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, assistantMsg]);
  }

  async function handleImportSingle(index: number) {
    if (!pendingJobs) return;
    const job = pendingJobs[index];
    setImportingJobs(true);
    await sendMessage(`Save this specific job: "${job.title}" at ${job.company}, location: ${job.location}, url: ${job.url}${job.salary ? `, salary: ${job.salary}` : ""}`);
    // Remove imported job from preview
    setPendingJobs((prev) => {
      if (!prev) return null;
      const updated = prev.filter((_, i) => i !== index);
      return updated.length > 0 ? updated : null;
    });
    setImportingJobs(false);
  }

  const lastSyncedLabel = syncStatus
    ? `${Math.max(0, Math.round((Date.now() - new Date(syncStatus.summary.lastSyncedAt).getTime()) / 60000))} minutes ago`
    : "Syncing...";

  const layerStatuses = syncStatus
    ? [
        { label: "Soul", healthy: Boolean(syncStatus.layers.soul.mission) },
        { label: "Identity", healthy: Boolean(syncStatus.layers.identity.name) },
        { label: "Agent", healthy: Boolean(syncStatus.layers.agent.mode) },
        { label: "History", healthy: syncStatus.layers.history.recentTurnCount >= 0 },
      ]
    : [
        { label: "Soul", healthy: false },
        { label: "Identity", healthy: false },
        { label: "Agent", healthy: false },
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
            <span className="font-semibold block mb-1">Agent Model:</span>
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
                {showToolUse ? "Hide Active Logs" : "Show Active Logs"}
              </button>
            </div>
            <p className="mt-1 text-[10px] text-muted leading-tight italic">Expose technical tool results and orchestrator calls.</p>
            {showToolUse && (() => {
              const allLogs = messages.flatMap((m: any) => m.toolLogs || []);
              if (allLogs.length === 0) return <p className="mt-2 text-[10px] text-muted">No tool calls yet this session.</p>;
              return (
                <div className="mt-2 space-y-1.5 max-h-[200px] overflow-y-auto custom-scrollbar">
                  {allLogs.map((log: any, i: number) => (
                    <div key={i} className={`rounded p-1.5 border ${
                      (typeof log.result === 'string' && (log.result.includes('Error') || log.result.includes('error') || log.result.includes('failed') || log.result.includes('"status":"error"')))
                        ? 'bg-red-50/50 border-red-200/40' : 'bg-green-50/50 border-green-200/40'
                    }`}>
                      <p className="font-bold text-[10px]">
                        <span className={
                          (typeof log.result === 'string' && (log.result.includes('Error') || log.result.includes('error') || log.result.includes('failed') || log.result.includes('"status":"error"')))
                            ? 'text-red-600' : 'text-green-600'
                        }>●</span>{' '}
                        {log.tool}
                      </p>
                      <p className="text-[9px] text-muted truncate">{JSON.stringify(log.parameters).slice(0, 80)}</p>
                    </div>
                  ))}
                </div>
              );
            })()}
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
            {initialLoading ? (
              <div className="flex flex-col gap-4 animate-pulse">
                <div className="max-w-[85%] rounded-xl px-4 py-3 bg-white/60 border border-white/20 w-3/4 h-24 self-start shadow-sm" />
                <div className="max-w-[85%] rounded-xl px-4 py-3 bg-cyan-600/30 w-1/2 h-16 self-end shadow-sm" />
                <div className="max-w-[85%] rounded-xl px-4 py-3 bg-white/60 border border-white/20 w-2/3 h-32 self-start shadow-sm" />
              </div>
            ) : (
              messages.map((message) => (
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
                  {/* Bug 9: Render markdown in assistant responses */}
                  {message.role === "ASSISTANT" ? (
                    <div className="prose prose-sm max-w-none prose-headings:font-bold prose-strong:font-bold prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0">
                      <ReactMarkdown>{message.content}</ReactMarkdown>
                    </div>
                  ) : (
                    message.content
                  )}
                </div>
              </div>
            )))}
            {/* Pending Jobs Preview Cards */}
            {pendingJobs && pendingJobs.length > 0 && !loading && (
              <div className="mx-1 space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="rounded-xl border border-cyan-200/60 bg-gradient-to-br from-cyan-50/80 to-white/90 p-4 shadow-sm backdrop-blur-sm">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-cyan-100 text-xs font-bold text-cyan-700">{pendingJobs.length}</span>
                      <p className="text-sm font-semibold text-slate-800">Jobs Found — Review Before Importing</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleImportAll}
                        disabled={importingJobs}
                        className="rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-all hover:from-emerald-600 hover:to-emerald-700 hover:shadow-md disabled:opacity-50 active:scale-95"
                      >
                        {importingJobs ? "Importing..." : "✅ Import All"}
                      </button>
                      <button
                        onClick={handleDismissJobs}
                        disabled={importingJobs}
                        className="rounded-lg border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-bold text-slate-600 shadow-sm transition-all hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 active:scale-95"
                      >
                        ❌ Dismiss
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar pr-1">
                    {pendingJobs.map((job, idx) => (
                      <div key={idx} className="group flex items-start justify-between rounded-lg border border-white/60 bg-white/70 p-3 transition-all hover:border-cyan-200 hover:bg-white hover:shadow-sm">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-slate-800 truncate">{job.title}</p>
                          <p className="text-xs text-slate-600 mt-0.5">{job.company} • {job.location}</p>
                          <div className="flex items-center gap-3 mt-1.5">
                            {job.salary && (
                              <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-200/60">
                                💰 {job.salary}
                              </span>
                            )}
                            {job.datePosted && (
                              <span className="text-[10px] text-slate-500 font-medium">{job.datePosted}</span>
                            )}
                            {job.source && (
                              <span className="text-[10px] text-slate-400">{job.source}</span>
                            )}
                            {job.url && (
                              <a href={job.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-cyan-600 hover:text-cyan-800 hover:underline truncate max-w-[200px]">
                                View listing ↗
                              </a>
                            )}
                          </div>
                          {job.description && (
                            <p className="mt-2 text-xs text-slate-500 line-clamp-2 leading-relaxed">{job.description}</p>
                          )}
                          {job.skills && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {job.skills.split(",").map((skill, i) => (
                                <span key={i} className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600">
                                  {skill.trim()}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => void handleImportSingle(idx)}
                          disabled={importingJobs}
                          className="ml-2 flex-none rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700 opacity-0 transition-all group-hover:opacity-100 hover:bg-emerald-100 disabled:opacity-50 active:scale-95"
                        >
                          Import
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {loading && !initialLoading ? (
              <div className="flex items-center gap-2 pl-2">
                <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-600" />
                <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-600 [animation-delay:-0.15s]" />
                <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-600 [animation-delay:-0.3s]" />
                <p className="text-xs text-muted italic">{importingJobs ? "Atlas is importing jobs..." : processingSteps[loadingTextIndex]}</p>
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
            onClick={() => void sendMessage()}
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
