import { NextResponse } from "next/server";
import { jobs } from "@/lib/mock/data";
import { buildJobsCsv } from "@/lib/services/export/csv-export";

export async function GET() {
  const csv = buildJobsCsv(jobs);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=jobs_export.csv",
    },
  });
}
