import { JobsTable } from "@/components/jobs/jobs-table";

export default function JobsPage() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <section className="flex-none pb-6">
        <h2 className="text-2xl font-extrabold tracking-tight">Jobs</h2>
        <p className="mt-1 text-sm text-muted">
          Unified job pipeline across alerts, recruiter emails, CSV imports, and manual entries.
        </p>
      </section>
      <div className="flex-1 overflow-hidden min-h-0">
        <JobsTable />
      </div>
    </div>
  );
}
