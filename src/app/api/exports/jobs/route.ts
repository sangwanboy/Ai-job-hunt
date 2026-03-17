import { NextResponse } from "next/server";
import { jobs } from "@/lib/mock/data";
import { buildWorkbookFromJobs } from "@/lib/services/export/excel-export";

export async function GET() {
  const fileBuffer = await buildWorkbookFromJobs(jobs);
  const binary = new Uint8Array(fileBuffer);

  return new NextResponse(binary, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=jobs_export.xlsx",
    },
  });
}
