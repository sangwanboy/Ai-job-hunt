import type { JobRow } from "@/types/domain";

export function buildJobsCsv(jobs: JobRow[]): string {
  const headers = [
    "id",
    "title",
    "company",
    "location",
    "workMode",
    "salaryRange",
    "score",
    "status",
    "priority",
    "source",
    "postedAt",
  ];

  const rows = jobs.map((job) =>
    [
      job.id,
      job.title,
      job.company,
      job.location,
      job.workMode,
      job.salaryRange,
      String(job.score),
      job.status,
      job.priority,
      job.source,
      job.postedAt,
    ]
      .map((value) => `"${String(value).replace(/"/g, '""')}"`)
      .join(","),
  );

  return [headers.join(","), ...rows].join("\n");
}
