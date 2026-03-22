import { Suspense } from "react";
import { LlmSettingsPanel } from "@/components/settings/llm-settings-panel";

function SettingsSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden animate-pulse">
      <section className="flex-none pb-6">
        <div className="h-8 w-32 bg-slate-200 rounded mb-2" />
        <div className="h-4 w-64 bg-slate-200 rounded" />
      </section>
      <div className="flex-1 space-y-4">
        <div className="panel p-5 space-y-3">
          <div className="h-5 w-40 bg-slate-200 rounded" />
          <div className="h-4 w-full bg-slate-200 rounded" />
          <div className="h-4 w-3/4 bg-slate-200 rounded" />
          <div className="h-10 w-full bg-slate-200 rounded mt-4" />
          <div className="h-10 w-full bg-slate-200 rounded" />
        </div>
        <div className="panel p-5 space-y-3">
          <div className="h-5 w-40 bg-slate-200 rounded" />
          <div className="h-10 w-full bg-slate-200 rounded mt-4" />
          <div className="h-10 w-full bg-slate-200 rounded" />
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <LlmSettingsPanel />
    </Suspense>
  );
}
