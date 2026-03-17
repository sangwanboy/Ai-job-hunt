import ExcelJS from "exceljs";
import type { JobRow } from "@/types/domain";

export async function buildWorkbookFromJobs(jobs: JobRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AI Job Intelligence Dashboard";
  workbook.created = new Date();

  const jobsSheet = workbook.addWorksheet("Jobs", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  jobsSheet.columns = [
    { header: "ID", key: "id", width: 20 },
    { header: "Title", key: "title", width: 34 },
    { header: "Company", key: "company", width: 24 },
    { header: "Location", key: "location", width: 20 },
    { header: "Work Mode", key: "workMode", width: 14 },
    { header: "Salary", key: "salaryRange", width: 16 },
    { header: "Score", key: "score", width: 10 },
    { header: "Status", key: "status", width: 14 },
    { header: "Priority", key: "priority", width: 14 },
    { header: "Source", key: "source", width: 18 },
    { header: "Posted", key: "postedAt", width: 14 },
  ];

  jobsSheet.addRows(jobs);
  jobsSheet.autoFilter = {
    from: "A1",
    to: "K1",
  };

  const firstRow = jobsSheet.getRow(1);
  firstRow.font = { bold: true };

  workbook.addWorksheet("Outreach");
  workbook.addWorksheet("Recruiters");
  workbook.addWorksheet("FollowUps");
  workbook.addWorksheet("AnalyticsSummary");
  workbook.addWorksheet("AgentMemorySummary");
  workbook.addWorksheet("AgentActivity");

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
