import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { mapSearchResultToCreatePayload } from "@/lib/services/jobs/job-row-mapper";
import { localJobsCache } from "@/lib/services/jobs/local-jobs-cache";
import { searchJobs } from "@/lib/services/jobs/job-search-tool";
import { scoreJob } from "@/lib/services/jobs/scoring-engine";

const searchSchema = z.object({
  keywords: z.string().min(1),
  location: z.string().min(1),
  resultsPerPage: z.number().int().min(1).max(20).optional(),
});

function parseSalaryBounds(salary: string): { salaryMin?: number; salaryMax?: number } {
  const values = salary.match(/\d[\d,.]*/g)?.map((part) => Number(part.replace(/,/g, ""))).filter(Number.isFinite) ?? [];
  if (values.length === 0) {
    return {};
  }
  if (values.length === 1) {
    return { salaryMin: Math.round(values[0]) };
  }
  return { salaryMin: Math.round(values[0]), salaryMax: Math.round(values[1]) };
}

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

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as unknown;
    const payload = searchSchema.parse(body);

    const results = await searchJobs(payload);
    const limited = results.slice(0, payload.resultsPerPage ?? 8);

    try {
      const user = await ensureLocalDevUser();

      await Promise.all(
        limited.map(async (result) => {
          const createPayload = mapSearchResultToCreatePayload(result);
          const company = await ensureCompany(createPayload.company);
          const salaryBounds = parseSalaryBounds(createPayload.salary);

          const score = scoreJob({
            titleSimilarity: 0.8,
            skillsOverlap: 0.7,
            locationFit: 0.9,
            workModeFit: 1.0,
            salaryFit: 0.8,
            experienceFit: 0.7,
            visaFit: 1.0,
            companyPreferenceFit: 0.5,
            urgency: 0.6,
            postingFreshness: 0.9,
            outreachPotential: 0.7,
            completeness: 0.8,
          });

          const finalUrl = result.url.includes("example.com") 
            ? `https://www.google.com/search?q=${encodeURIComponent(`${result.title} jobs at ${result.company}`)}`
            : result.url;

          const job = await prisma.job.create({
            data: {
              userId: user.id,
              source: createPayload.source,
              sourceUrl: finalUrl,
              title: createPayload.title,
              companyId: company.id,
              location: createPayload.location,
              workMode: createPayload.workMode,
              salaryMin: salaryBounds.salaryMin,
              salaryMax: salaryBounds.salaryMax,
              currency: createPayload.salary.includes("GBP") ? "GBP" : undefined,
              applicationStatus: createPayload.status,
              priority: createPayload.priority,
              descriptionRaw: result.description,
            },
            select: { id: true },
          });

          await prisma.jobScore.create({
            data: {
              jobId: job.id,
              userId: user.id,
              totalScore: score.totalScore,
              confidence: score.confidence,
              explanation: score.explanation,
              factorBreakdown: score.factorBreakdown as any,
              missingDataPenalty: score.missingInformationPenalty,
            },
          });
        }),
      );
    } catch {
      localJobsCache.upsertMany(
        limited.map((result, index) => {
          const createPayload = mapSearchResultToCreatePayload(result);
          const score = scoreJob({
            titleSimilarity: 0.8,
            skillsOverlap: 0.7,
            locationFit: 0.9,
            workModeFit: 1.0,
            salaryFit: 0.8,
            experienceFit: 0.7,
            visaFit: 1.0,
            companyPreferenceFit: 0.5,
            urgency: 0.6,
            postingFreshness: 0.9,
            outreachPotential: 0.7,
            completeness: 0.8,
          });

          return {
            id: `search-${Date.now()}-${index}`,
            title: createPayload.title,
            company: createPayload.company,
            location: createPayload.location,
            workMode: createPayload.workMode,
            salaryRange: createPayload.salary,
            score: Math.round(score.totalScore),
            status: createPayload.status,
            priority: createPayload.priority,
            source: createPayload.source,
            postedAt: result.postedDate.slice(0, 10),
            sourceUrl: result.url.includes("example.com") 
              ? `https://www.google.com/search?q=${encodeURIComponent(`${result.title} jobs at ${result.company}`)}`
              : result.url,
          };
        }),
      );
    }

    return NextResponse.json({
      success: true,
      importedCount: limited.length,
      results: limited,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Job search failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
