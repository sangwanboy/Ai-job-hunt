import Link from "next/link";
import { OverviewKpis } from "@/components/dashboard/overview-kpis";
import { WeeklyTrendChart } from "@/components/dashboard/weekly-trend-chart";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-2xl font-extrabold tracking-tight">Dashboard</h2>
        <p className="mt-1 text-sm text-muted">
          Control tower for job intelligence, outreach queue health, and agent-guided next actions.
        </p>
      </section>

      <OverviewKpis />

      <section className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <WeeklyTrendChart />
        <div className="panel p-5">
          <h3 className="text-lg font-bold">Today&apos;s Action Queue</h3>
          <ul className="mt-4 space-y-3 text-sm">
            <li className="rounded-xl border border-white/60 bg-white/75 p-3">
              <p>Follow up with 3 recruiters from last week.</p>
              <Link href="/outreach" className="btn-secondary mt-2 inline-block">
                Open Follow-ups
              </Link>
            </li>
            <li className="rounded-xl border border-white/60 bg-white/75 p-3">
              <p>Review 5 high-priority roles scored over 75.</p>
              <Link href="/jobs" className="btn-secondary mt-2 inline-block">
                Review Jobs
              </Link>
            </li>
            <li className="rounded-xl border border-white/60 bg-white/75 p-3">
              <p>Ask Atlas to draft two personalized outreach messages.</p>
              <Link href="/agents/workspace" className="btn-secondary mt-2 inline-block">
                Open Agent Workspace
              </Link>
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}
