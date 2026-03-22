"use client";

import { useEffect, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { dashboardTrend } from "@/lib/mock/data";

const fallbackTrend = [
  { date: "Mon", applied: 8, replies: 3 },
  { date: "Tue", applied: 12, replies: 5 },
  { date: "Wed", applied: 10, replies: 4 },
  { date: "Thu", applied: 15, replies: 6 },
  { date: "Fri", applied: 11, replies: 5 },
  { date: "Sat", applied: 6, replies: 2 },
  { date: "Sun", applied: 4, replies: 1 },
];

export function WeeklyTrendChart() {
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => { setIsMounted(true); }, []);

  const data = dashboardTrend.length > 0 ? dashboardTrend : fallbackTrend;

  return (
    <div className="panel p-5">
      <div className="mb-5">
        <h2 className="text-lg font-bold">Weekly Funnel Trend</h2>
        <p className="text-sm text-muted">Applications, replies, and interviews across the last 7 days.</p>
      </div>
      <div className="h-[300px]">
        {isMounted && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ left: 0, right: 0, top: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="applied" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="replies" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.3)" />
              <XAxis dataKey="date" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} />
              <Tooltip />
              <Area type="monotone" dataKey="applied" stroke="#0ea5e9" fill="url(#applied)" strokeWidth={2} />
              <Area type="monotone" dataKey="replies" stroke="#10b981" fill="url(#replies)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
