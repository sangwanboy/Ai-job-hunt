import { AgentChatStarter } from "@/components/agents/agent-chat-starter";

export default function AgentWorkspacePage() {
  return (
    <div className="flex h-full max-h-full min-h-0 flex-col overflow-hidden p-2 md:p-3 lg:p-4">
      <section className="flex-none pb-3">
        <h2 className="text-2xl font-extrabold tracking-tight text-slate-800">Agent Workspace</h2>
        <p className="mt-1 text-xs text-muted">
          Stateful intelligence OS with core identity persistence.
        </p>
      </section>
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
        <AgentChatStarter />
      </div>
    </div>
  );
}
