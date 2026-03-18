import type { ApplicationStatus, Priority, WorkMode } from "@/lib/domain/enums";
import type { JobRow } from "@/types/domain";

function inferWorkMode(value: string): WorkMode {
  const text = value.toLowerCase();
  if (text.includes("remote")) {
    return "REMOTE";
  }
  if (text.includes("hybrid")) {
    return "HYBRID";
  }
  return "ONSITE";
}

export function toSalaryRange(salaryMin?: number | null, salaryMax?: number | null, currency?: string | null): string {
  const symbol = currency ? `${currency} ` : "";
  if (typeof salaryMin === "number" && typeof salaryMax === "number") {
    return `${symbol}${Math.round(salaryMin).toLocaleString()}-${Math.round(salaryMax).toLocaleString()}`;
  }
  if (typeof salaryMin === "number") {
    return `${symbol}${Math.round(salaryMin).toLocaleString()}+`;
  }
  if (typeof salaryMax === "number") {
    return `Up to ${symbol}${Math.round(salaryMax).toLocaleString()}`;
  }
  return "Not listed";
}

export function mapSearchResultToCreatePayload(result: {
  title: string;
  company: string;
  location: string;
  salary: string;
  url: string;
}): {
  title: string;
  company: string;
  location: string;
  salary: string;
  url: string;
  source: string;
  status: ApplicationStatus;
  priority: Priority;
  workMode: WorkMode;
} {
  return {
    title: result.title,
    company: result.company,
    location: result.location,
    salary: result.salary,
    url: result.url,
    source: "Browser",
    status: "SAVED",
    priority: "MEDIUM",
    workMode: inferWorkMode(result.location),
  };
}

export function mapDbJobToRow(job: {
  id: string;
  title: string;
  location: string | null;
  workMode: WorkMode | null;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
  applicationStatus: ApplicationStatus;
  priority: Priority;
  source: string;
  sourceUrl: string | null;
  postedDate: Date | null;
  createdAt: Date;
  company: { name: string } | null;
  scores?: Array<{ totalScore: number }>;
}): JobRow {
  return {
    id: job.id,
    title: job.title,
    company: job.company?.name ?? "Unknown company",
    location: job.location ?? "Unknown",
    workMode: job.workMode ?? "REMOTE",
    salaryRange: toSalaryRange(job.salaryMin, job.salaryMax, job.currency),
    score: Math.round(job.scores?.[0]?.totalScore ?? 0),
    status: job.applicationStatus,
    priority: job.priority,
    source: job.source,
    postedAt: (job.postedDate ?? job.createdAt).toISOString().slice(0, 10),
    sourceUrl: job.sourceUrl ?? undefined,
  };
}
