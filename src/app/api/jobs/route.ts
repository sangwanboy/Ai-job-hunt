import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { applicationStatuses, priorities } from "@/lib/domain/enums";
import { mapDbJobToRow } from "@/lib/services/jobs/job-row-mapper";
import { localJobsCache } from "@/lib/services/jobs/local-jobs-cache";

const createJobSchema = z.object({
  title: z.string().min(1),
  company: z.string().min(1),
  location: z.string().min(1),
  salary: z.string().optional(),
  url: z.string().url().optional(),
  source: z.string().min(1),
  status: z.enum(applicationStatuses).optional(),
  priority: z.enum(priorities).optional(),
  description: z.string().optional(),
  skills: z.string().optional(),
  datePosted: z.string().optional(),
});

async function ensureLocalDevUser() {
  return prisma.user.upsert({
    where: { email: "local-dev-user@ai-job-os.local" },
    update: { name: "Local Dev User" },
    create: {
      email: "local-dev-user@ai-job-os.local",
      name: "Local Dev User",
    },
    select: { id: true },
  });
}

async function ensureCompany(name: string) {
  const existing = await prisma.company.findFirst({
    where: { name },
    select: { id: true },
  });

  if (existing) {
    return existing;
  }

  return prisma.company.create({
    data: { name },
    select: { id: true },
  });
}

function parseSalaryBounds(salary?: string): { salaryMin?: number; salaryMax?: number } {
  if (!salary) {
    return {};
  }

  const values = salary.match(/\d[\d,.]*/g)?.map((part) => Number(part.replace(/,/g, ""))).filter(Number.isFinite) ?? [];
  if (values.length === 0) {
    return {};
  }
  if (values.length === 1) {
    return { salaryMin: Math.round(values[0]) };
  }
  return { salaryMin: Math.round(values[0]), salaryMax: Math.round(values[1]) };
}

export async function GET() {
  try {
    const jobs = (await prisma.job.findMany({
      include: {
        company: { select: { name: true } },
        scores: {
          select: { totalScore: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
      take: 250,
    })) as Array<{
      id: string;
      title: string;
      location: string | null;
      workMode: "REMOTE" | "HYBRID" | "ONSITE" | null;
      salaryMin: number | null;
      salaryMax: number | null;
      currency: string | null;
      applicationStatus: "NEW" | "SAVED" | "APPLIED" | "INTERVIEW" | "OFFER" | "REJECTED" | "ARCHIVED";
      priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
      source: string;
      sourceUrl: string | null;
      postedDate: Date | null;
      createdAt: Date;
      company: { name: string } | null;
      scores?: Array<{ totalScore: number }>;
    }>;

    return NextResponse.json({ jobs: jobs.map((job) => mapDbJobToRow(job)) });
  } catch {
    return NextResponse.json({ jobs: localJobsCache.list() });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as unknown;
    const payload = createJobSchema.parse(body);

    // Validate: reject titles that look like chat messages (contain question marks, very long, or obviously not job titles)
    const junkPatterns = [
      /\?.*\?/,                    // Multiple question marks
      /^(status|do i|what|how|when|where|why|can you|please|help)/i,  // Chat-like starts
      /at \d+$/,                   // "...at 7", "...at 8" (pagination artifacts)
    ];
    if (junkPatterns.some(p => p.test(payload.title)) || payload.title.length > 150) {
      return NextResponse.json({ error: "Title appears to be a chat message, not a job title. Rejected." }, { status: 400 });
    }

    try {
      const user = await ensureLocalDevUser();
      const company = await ensureCompany(payload.company);
      const salaryBounds = parseSalaryBounds(payload.salary);

      const job = await prisma.job.create({
        data: {
          userId: user.id,
          source: payload.source,
          sourceUrl: payload.url,
          title: payload.title,
          companyId: company.id,
          location: payload.location,
          salaryMin: salaryBounds.salaryMin,
          salaryMax: salaryBounds.salaryMax,
          currency: payload.salary ? "GBP" : undefined,
          applicationStatus: payload.status ?? "SAVED",
          priority: payload.priority ?? "MEDIUM",
          descriptionRaw: payload.description,
          requiredSkills: payload.skills ? payload.skills.split(",").map(s => s.trim()) : [],
          // postedDate: payload.datePosted ? new Date(payload.datePosted) : undefined,
        },
        select: {
          id: true,
          title: true,
        },
      });

      return NextResponse.json({
        success: true,
        job: {
          id: job.id,
          title: job.title,
          company: payload.company,
        },
      });
    } catch (error) {
      console.warn("Prisma unavailable for /api/jobs POST, returning mock success", error);
      const fallbackId = `mock-${Date.now()}`;
      localJobsCache.upsert({
        id: fallbackId,
        title: payload.title,
        company: payload.company,
        location: payload.location,
        workMode: "REMOTE",
        salaryRange: payload.salary ?? "Not listed",
        score: 0,
        status: payload.status ?? "SAVED",
        priority: payload.priority ?? "MEDIUM",
        source: payload.source,
        postedAt: new Date().toISOString().slice(0, 10),
        sourceUrl: payload.url,
      });

      return NextResponse.json({
        success: true,
        warning: "Prisma unavailable. Returning mock success.",
        job: {
          id: fallbackId,
          title: payload.title,
          company: payload.company,
        },
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create job";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("id");
    const cleanJunk = searchParams.get("cleanJunk");

    if (cleanJunk === "true") {
      // Clean up junk entries that look like chat messages
      const deleted = await prisma.job.deleteMany({
        where: {
          OR: [
            { title: { contains: "?" } },
            { title: { contains: "status" } },
            { title: { startsWith: "do i" } },
            { title: { startsWith: "what" } },
            { title: { startsWith: "how" } },
          ],
        },
      });
      return NextResponse.json({ success: true, deletedCount: deleted.count });
    }

    if (!jobId) {
      return NextResponse.json({ error: "Missing job id" }, { status: 400 });
    }

    await prisma.job.delete({ where: { id: jobId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete job";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
