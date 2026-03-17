import { AgentChatStarter } from "@/components/agents/agent-chat-starter";

export default function AgentWorkspacePage() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-2 md:p-4 lg:p-6">
      <section className="flex-none pb-3">
        <h2 className="text-2xl font-extrabold tracking-tight">Agent Workspace</h2>
        <p className="mt-1 text-sm text-muted">
          Stateful chat with soul/identity/mind/memory architecture, onboarding-first behavior, and token-aware control.
        </p>
      </section>
      <div className="min-h-0 flex-1 overflow-hidden">
        <AgentChatStarter />
      </div>
    </div>
  );
}
