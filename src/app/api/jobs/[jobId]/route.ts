import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { applicationStatuses } from "@/lib/domain/enums";
import { localJobsCache } from "@/lib/services/jobs/local-jobs-cache";

const updateSchema = z.object({
  status: z.enum(applicationStatuses),
});

type Params = {
  params: Promise<{ jobId: string }>;
};

export async function PATCH(request: Request, { params }: Params) {
  const { jobId } = await params;

  try {
    const body = (await request.json()) as unknown;
    const payload = updateSchema.parse(body);

    try {
      const updated = await prisma.job.update({
        where: { id: jobId },
        data: { applicationStatus: payload.status },
        select: { id: true, applicationStatus: true },
      });

      return NextResponse.json({ success: true, job: updated });
    } catch {
      const fallback = localJobsCache.updateStatus(jobId, payload.status);
      if (!fallback) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
      }
      return NextResponse.json({
        success: true,
        warning: "Prisma unavailable. Updated fallback cache only.",
        job: { id: fallback.id, applicationStatus: fallback.status },
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update job";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
