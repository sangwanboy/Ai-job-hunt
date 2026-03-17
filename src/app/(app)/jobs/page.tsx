import { JobsTable } from "@/components/jobs/jobs-table";

export default function JobsPage() {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-2xl font-extrabold tracking-tight">Jobs</h2>
        <p className="mt-1 text-sm text-muted">
          Unified job pipeline across alerts, recruiter emails, CSV imports, and manual entries.
        </p>
      </section>
      <JobsTable />
    </div>
  );
}
