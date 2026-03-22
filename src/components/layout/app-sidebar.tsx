"use client";

import { useEffect, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, BriefcaseBusiness, ChartNoAxesCombined, LayoutDashboard, Megaphone, Settings } from "lucide-react";
import type { RuntimeSettingsResponse } from "@/types/settings";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/jobs", label: "Jobs", icon: BriefcaseBusiness },
  { href: "/agents/workspace", label: "Agent Workspace", icon: Bot },
  { href: "/outreach", label: "Outreach", icon: Megaphone },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/analytics", label: "Analytics", icon: ChartNoAxesCombined },
] as const satisfies ReadonlyArray<{ href: Route; label: string; icon: React.ComponentType<{ className?: string }> }>;

export function AppSidebar() {
  const pathname = usePathname();
  const [runtime, setRuntime] = useState<RuntimeSettingsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/settings/runtime");
        if (res.ok) {
          const data = (await res.json()) as RuntimeSettingsResponse;
          setRuntime(data);
        }
      } catch {
        // Ignore fetch errors in local dev/degraded mode
      } finally {
        setIsLoading(false);
      }
    }
    void load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  const totalTokens = runtime?.usage.totalTokens ?? 0;
  const budget = runtime?.settings.monthlyTokenBudget ?? 1000000;
  const percentage = Math.min(100, Math.round((totalTokens / budget) * 100));
  const budgetLabel = budget >= 1000000 ? `${(budget / 1000000).toFixed(1)}M` : `${Math.round(budget / 1000)}k`;
  const usageDisplay = totalTokens >= 1000 ? `${(totalTokens / 1000).toFixed(1)}k` : totalTokens;

  return (
    <aside className="border-r border-white/60 bg-white/50 p-5 backdrop-blur lg:sticky lg:top-0 lg:h-screen">
      <div className="rounded-2xl border border-white/65 bg-white/70 p-4 shadow-sm">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted">AIG</p>
        <h1 className="mt-2 text-lg font-black leading-tight text-cyan-600">JOB OS</h1>
        <p className="mt-2 text-xs text-muted">Agent-led job discovery, ranking, and outreach operations.</p>
      </div>

      <nav className="mt-7 space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname ? pathname === item.href || pathname.startsWith(`${item.href}/`) : false;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex items-center gap-3 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                active
                  ? "border-cyan-200/80 bg-cyan-50/80 text-slate-900"
                  : "border-transparent text-muted hover:border-white/70 hover:bg-white/75 hover:text-text"
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-8 space-y-4">
        <div className="rounded-2xl border border-white/60 bg-white/70 p-3 text-xs">
          {isLoading && !runtime ? (
            <div className="space-y-2 animate-pulse">
              <div className="flex items-center justify-between mb-2">
                <div className="h-3 w-20 bg-slate-200 rounded" />
                <div className="h-3 w-24 bg-slate-200 rounded" />
              </div>
              <div className="h-1.5 w-full rounded-full bg-slate-200" />
              <div className="h-3 w-28 bg-slate-200 rounded mt-2" />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <p className="font-bold text-text">Token Usage</p>
                <span className="text-[10px] font-medium text-muted">{percentage}% of monthly cap</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                <div className="h-full bg-cyan-500 rounded-full transition-all duration-500" style={{ width: `${percentage}%` }} />
              </div>
              <p className="mt-2 text-[10px] text-muted">
                {usageDisplay} / {budgetLabel} tokens used
              </p>
            </>
          )}
        </div>

        <div className="rounded-2xl border border-white/60 bg-white/70 p-3 text-xs text-muted">
          <p className="font-semibold text-text">Execution Mode</p>
          <p className="mt-1">Draft-first outreach, user-approved actions, token-aware agents.</p>
        </div>
      </div>
    </aside>
  );
}

