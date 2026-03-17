import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { kpiMetrics } from "@/lib/mock/data";

function TrendIcon({ trend }: { trend: "up" | "down" | "flat" }) {
  if (trend === "up") {
    return <ArrowUpRight className="h-4 w-4 text-success" />;
  }
  if (trend === "down") {
    return <ArrowDownRight className="h-4 w-4 text-danger" />;
  }
  return <Minus className="h-4 w-4 text-muted" />;
}

export function OverviewKpis() {
  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {kpiMetrics.map((metric) => (
        <article key={metric.label} className="kpi-card">
          <p className="text-sm text-muted">{metric.label}</p>
          <div className="mt-2 flex items-end justify-between">
            <p className="text-2xl font-extrabold tracking-tight">{metric.value}</p>
            <div className="flex items-center gap-1 text-sm font-semibold">
              <TrendIcon trend={metric.trend} />
              {metric.delta}
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}
