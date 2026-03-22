"use client";

import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { RuntimeSettingsResponse } from "@/types/settings";

type FunnelPoint = { week: string; applications: number; replies: number; interviews: number };
type SourcePoint = { source: string; count: number };
type OutreachPoint = { day: string; replyRate: number };

const fallbackFunnel: FunnelPoint[] = [
  { week: "Week 1", applications: 14, replies: 5, interviews: 2 },
  { week: "Week 2", applications: 18, replies: 7, interviews: 3 },
  { week: "Week 3", applications: 16, replies: 6, interviews: 2 },
  { week: "Week 4", applications: 21, replies: 8, interviews: 4 },
];

const fallbackSources: SourcePoint[] = [
  { source: "LinkedIn Alert", count: 12 },
  { source: "CSV Import", count: 7 },
  { source: "Manual", count: 5 },
  { source: "Recruiter Email", count: 4 },
];

const fallbackOutreach: OutreachPoint[] = [
  { day: "Mon", replyRate: 18 },
  { day: "Tue", replyRate: 24 },
  { day: "Wed", replyRate: 21 },
  { day: "Thu", replyRate: 29 },
  { day: "Fri", replyRate: 26 },
  { day: "Sat", replyRate: 14 },
  { day: "Sun", replyRate: 17 },
];

const sourceColors = ["#0891b2", "#14b8a6", "#f59e0b", "#8b5cf6"];

export default function AnalyticsPage() {
  const [funnel, setFunnel] = useState<FunnelPoint[]>(fallbackFunnel);
  const [sources, setSources] = useState<SourcePoint[]>(fallbackSources);
  const [outreach, setOutreach] = useState<OutreachPoint[]>(fallbackOutreach);
  const [runtime, setRuntime] = useState<RuntimeSettingsResponse | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    let ignore = false;

    async function load() {
      const [funnelResponse, sourcesResponse, outreachResponse, runtimeResponse] = await Promise.all([
        fetch("/api/analytics/funnel"),
        fetch("/api/analytics/sources"),
        fetch("/api/analytics/outreach"),
        fetch("/api/settings/runtime"),
      ]);

      const [funnelPayload, sourcesPayload, outreachPayload, runtimePayload] = await Promise.all([
        funnelResponse.json(),
        sourcesResponse.json(),
        outreachResponse.json(),
        runtimeResponse.json(),
      ]);

      if (!ignore) {
        setFunnel(Array.isArray(funnelPayload) && funnelPayload.length > 0 ? funnelPayload as FunnelPoint[] : fallbackFunnel);
        setSources(Array.isArray(sourcesPayload) && sourcesPayload.length > 0 ? sourcesPayload as SourcePoint[] : fallbackSources);
        setOutreach(Array.isArray(outreachPayload) && outreachPayload.length > 0 ? outreachPayload as OutreachPoint[] : fallbackOutreach);
        setRuntime(runtimePayload as RuntimeSettingsResponse);
      }
    }

    void load();

    return () => {
      ignore = true;
    };
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <section className="flex flex-none flex-wrap items-start justify-between gap-3 pb-6">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Analytics</h2>
          <p className="mt-1 text-sm text-muted">Weekly funnel, job sources, outreach performance, and provider usage.</p>
        </div>
      </section>

      <div className="flex-1 overflow-y-auto min-h-0 space-y-6 pb-6 custom-scrollbar">
        <section className="grid gap-4 xl:grid-cols-2">
          <article className="panel p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold">Application Funnel</h3>
                <p className="text-sm text-muted">Applications, replies, and interviews over the last 4 weeks.</p>
              </div>
            </div>
            <div className="h-80" role="img" aria-label="Application funnel chart for weekly applications, replies, and interviews">
              {isMounted && (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={funnel} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                    <XAxis dataKey="week" />
                    <YAxis />
                    <Tooltip />
                    <Legend iconType="circle" />
                    <Area name="Applications" type="monotone" dataKey="applications" stroke="#0891b2" fill="#0891b233" strokeWidth={2} />
                    <Area name="Replies" type="monotone" dataKey="replies" stroke="#14b8a6" fill="#14b8a633" strokeWidth={2} />
                    <Area name="Interviews" type="monotone" dataKey="interviews" stroke="#f59e0b" fill="#f59e0b33" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {funnel.map((point) => {
                const replyConversion = point.applications === 0 ? 0 : Math.round((point.replies / point.applications) * 100);
                const interviewConversion = point.replies === 0 ? 0 : Math.round((point.interviews / point.replies) * 100);
                return (
                  <div key={point.week} className="rounded-lg border bg-bg p-3 text-sm">
                    <p className="font-semibold">{point.week}</p>
                    <p className="text-muted">Reply conversion: {replyConversion}%</p>
                    <p className="text-muted">Interview conversion: {interviewConversion}%</p>
                  </div>
                );
              })}
            </div>
          </article>

          <article className="panel p-5">
            <h3 className="text-lg font-bold">Job Source Breakdown</h3>
            <p className="text-sm text-muted">Where your opportunity volume is coming from.</p>
            <div className="h-80" role="img" aria-label="Job source breakdown pie chart">
              {isMounted && (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={sources} dataKey="count" nameKey="source" outerRadius={110} label>
                      {sources.map((entry, index) => (
                        <Cell key={entry.source} fill={sourceColors[index % sourceColors.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </article>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <article className="panel p-5">
            <h3 className="text-lg font-bold">Outreach Performance</h3>
            <p className="text-sm text-muted">Reply rate percentage over the last 7 days.</p>
            <div className="h-80" role="img" aria-label="Outreach reply rate line chart for the last seven days">
              {isMounted && (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={outreach}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                    <XAxis dataKey="day" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip />
                    <Line type="monotone" dataKey="replyRate" stroke="#0891b2" strokeWidth={3} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </article>

          <article className="panel p-5">
            <h3 className="text-lg font-bold">Provider Token Usage</h3>
            <p className="text-sm text-muted">Requests and total tokens by provider from runtime usage tracking.</p>
            <div className="h-80" role="img" aria-label="Provider token usage bar chart">
              {isMounted && (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={runtime?.usage.byProvider ?? []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                    <XAxis dataKey="provider" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="requests" fill="#14b8a6" />
                    <Bar dataKey="totalTokens" fill="#0891b2" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </article>
        </section>
      </div>
    </div>
  );
}
