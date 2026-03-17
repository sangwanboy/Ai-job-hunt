import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { ApplicationStatus } from "@/lib/domain/enums";

const mockFunnel = [
  { week: "Week 1", applications: 14, replies: 5, interviews: 2 },
  { week: "Week 2", applications: 18, replies: 7, interviews: 3 },
  { week: "Week 3", applications: 16, replies: 6, interviews: 2 },
  { week: "Week 4", applications: 21, replies: 8, interviews: 4 },
];

function startOfWeek(date: Date) {
  const clone = new Date(date);
  const day = clone.getDay();
  const diff = clone.getDate() - day + (day === 0 ? -6 : 1);
  clone.setDate(diff);
  clone.setHours(0, 0, 0, 0);
  return clone;
}

export async function GET() {
  try {
    const now = new Date();
    const start = startOfWeek(new Date(now.getTime() - 27 * 24 * 60 * 60 * 1000));
    const jobs = (await prisma.job.findMany({
      where: { createdAt: { gte: start } },
      select: { createdAt: true, applicationStatus: true },
      orderBy: { createdAt: "asc" },
    })) as Array<{ createdAt: Date; applicationStatus: ApplicationStatus }>;

    if (jobs.length === 0) {
      return NextResponse.json(mockFunnel);
    }

    const weeks = Array.from({ length: 4 }, (_, index) => {
      const weekStart = new Date(start);
      weekStart.setDate(start.getDate() + index * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);
      const items = jobs.filter((job) => job.createdAt >= weekStart && job.createdAt < weekEnd);
      const applications = items.length;
      const replies = items.filter((job) => job.applicationStatus === "INTERVIEW" || job.applicationStatus === "OFFER").length;
      const interviews = items.filter((job) => job.applicationStatus === "INTERVIEW" || job.applicationStatus === "OFFER").length;
      return {
        week: `Week ${index + 1}`,
        applications,
        replies,
        interviews,
      };
    });

    return NextResponse.json(weeks);
  } catch {
    return NextResponse.json(mockFunnel);
  }
}
