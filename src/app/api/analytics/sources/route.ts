import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const mockSources = [
  { source: "LinkedIn Alert", count: 12 },
  { source: "CSV Import", count: 7 },
  { source: "Manual", count: 5 },
  { source: "Recruiter Email", count: 4 },
];

export async function GET() {
  try {
    const jobs = (await prisma.job.findMany({
      select: { source: true },
      take: 250,
    })) as Array<{ source: string }>;

    if (jobs.length === 0) {
      return NextResponse.json(mockSources);
    }

    const grouped = jobs.reduce((acc: Record<string, number>, job) => {
      acc[job.source] = (acc[job.source] ?? 0) + 1;
      return acc;
    }, {});

    return NextResponse.json(
      Object.entries(grouped).map(([source, count]) => ({ source, count })),
    );
  } catch {
    return NextResponse.json(mockSources);
  }
}
