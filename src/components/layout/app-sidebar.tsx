"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, BriefcaseBusiness, ChartNoAxesCombined, LayoutDashboard, Megaphone, Settings } from "lucide-react";

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

  return (
    <aside className="border-r border-white/60 bg-white/50 p-5 backdrop-blur lg:sticky lg:top-0 lg:h-screen">
      <div className="rounded-2xl border border-white/65 bg-white/70 p-4 shadow-sm">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted">AI Job OS</p>
        <h1 className="mt-2 text-lg font-black leading-tight">Intelligence Dashboard</h1>
        <p className="mt-2 text-xs text-muted">Agent-led job discovery, ranking, and outreach operations.</p>
      </div>

      <nav className="mt-7 space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname ? (pathname === item.href || pathname.startsWith(`${item.href}/`)) : false;
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
          <div className="flex items-center justify-between mb-2">
            <p className="font-bold text-text">Token Usage</p>
            <span className="text-[10px] font-medium text-muted">0% of monthly cap</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
            <div className="h-full bg-cyan-500 rounded-full" style={{ width: '0%' }} />
          </div>
          <p className="mt-2 text-[10px] text-muted">0 / 1.0M tokens used</p>
        </div>

        <div className="rounded-2xl border border-white/60 bg-white/70 p-3 text-xs text-muted">
          <p className="font-semibold text-text">Execution Mode</p>
          <p className="mt-1">Draft-first outreach, user-approved actions, token-aware agents.</p>
        </div>
      </div>
    </aside>
  );
}
