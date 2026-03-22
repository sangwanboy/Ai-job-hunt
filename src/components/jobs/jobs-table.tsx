"use client";

import * as React from "react";
import {
  type SortingState,
  type VisibilityState,
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useSearchParams } from "next/navigation";
import type { JobRow } from "@/types/domain";

const columnHelper = createColumnHelper<JobRow>();

/* ── persistent cache so back-navigation is instant (Bug 4) ── */
let cachedJobs: JobRow[] | null = null;

export function JobsTable() {
  const searchParams = useSearchParams();
  const qParam = searchParams?.get("q") || "";

  const [rows, setRows] = React.useState<JobRow[]>(cachedJobs ?? []);
  const [isLoading, setIsLoading] = React.useState(cachedJobs === null);
  const [isSearching, setIsSearching] = React.useState(false);
  const [syncMessage, setSyncMessage] = React.useState<string>("");
  const [keywords, setKeywords] = React.useState(qParam || "software engineer");
  const [location, setLocation] = React.useState("london");
  const [globalFilter, setGlobalFilter] = React.useState(qParam);
  const [sorting, setSorting] = React.useState<SortingState>([{ id: "score", desc: true }]);
  const [selectedJob, setSelectedJob] = React.useState<JobRow | null>(null);

  /* Hide the hidden company column (Bug 13) */
  const [columnVisibility] = React.useState<VisibilityState>({ company: false });

  const refreshJobs = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/jobs", { cache: "no-store" });
      const payload = (await response.json()) as { jobs?: JobRow[]; error?: string };
      const jobs = payload.jobs ?? [];
      setRows(jobs);
      cachedJobs = jobs;
      setSyncMessage(payload.error ? payload.error : "");
    } catch {
      setSyncMessage("Unable to load jobs right now.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refreshJobs();
  }, [refreshJobs]);

  /* Bug 8: read ?q= from URL and apply to filter + keywords */
  React.useEffect(() => {
    if (qParam) {
      setGlobalFilter(qParam);
      setKeywords(qParam);
    }
  }, [qParam]);

  const setStatus = React.useCallback(async (jobId: string, status: any) => {
    try {
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        throw new Error("Failed to update status");
      }
      setSyncMessage(`Updated status to ${status}.`);
      setRows((current) => current.map((row) => (row.id === jobId ? { ...row, status } : row)));
      setTimeout(() => setSyncMessage(""), 3000);
    } catch {
      setSyncMessage("Error updating job status.");
    }
  }, []);

  const columns = React.useMemo(
    () => [
      columnHelper.accessor("title", {
        header: "Role",
        cell: (info) => (
          <div>
            <p className="font-semibold">{info.getValue()}</p>
            <p className="text-xs text-muted">{info.row.original.company}</p>
          </div>
        ),
      }),
      /* Bug 13: Give company column a proper header label, hide via column visibility */
      columnHelper.accessor("company", {
        header: "Company",
        enableGlobalFilter: true,
      }),
      columnHelper.accessor("location", {
        header: "Location",
        cell: (info) => (
          <div>
            <p>{info.getValue()}</p>
            <p className="text-xs text-muted">{info.row.original.workMode}</p>
          </div>
        ),
      }),
      columnHelper.accessor("salaryRange", { header: "Salary" }),
      columnHelper.accessor("score", {
        header: "Score",
        cell: (info) => <span className="font-bold text-accent">{info.getValue()}</span>,
      }),
      columnHelper.accessor("status", {
        header: "Status",
        cell: (info) => <span className="badge bg-bg">{info.getValue()}</span>,
      }),
      columnHelper.accessor("priority", {
        header: "Priority",
        cell: (info) => <span className="badge bg-bg">{info.getValue()}</span>,
      }),
      columnHelper.accessor("source", { header: "Source" }),
      columnHelper.accessor("postedAt", { header: "Posted" }),
      columnHelper.display({
        id: "actions",
        header: "Actions",
        cell: (info) => (
          <div className="flex gap-2">
            {/* Apply: real anchor tag for reliable new-tab behavior */}
            <a
              href={info.row.original.sourceUrl || `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(`${info.row.original.title} ${info.row.original.company}`)}&location=${encodeURIComponent(info.row.original.location || '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary px-3 py-1 inline-block text-center no-underline"
              onMouseDown={() => void setStatus(info.row.original.id, "APPLIED")}
            >
              Apply ↗
            </a>
            {/* Bug 3: Review opens detail panel instead of navigating away */}
            <button
              type="button"
              className="btn-secondary px-3 py-1"
              onClick={() => {
                void setStatus(info.row.original.id, "SAVED");
                setSelectedJob(info.row.original);
              }}
            >
              Review
            </button>
          </div>
        ),
      }),
    ],
    [setStatus],
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
    state: { globalFilter, sorting, columnVisibility },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
  });

  const totalRows = table.getFilteredRowModel().rows.length;
  const pagination = table.getState().pagination;
  const start = totalRows === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1;
  const end = totalRows === 0 ? 0 : Math.min(totalRows, start + table.getRowModel().rows.length - 1);

  async function runLiveSearch() {
    setIsSearching(true);
    setSyncMessage("");

    try {
      const response = await fetch("/api/jobs/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords, location, resultsPerPage: 10 }),
      });

      const payload = (await response.json()) as { importedCount?: number; error?: string };
      if (!response.ok) {
        setSyncMessage(payload.error ?? "Job search failed.");
        return;
      }

      setSyncMessage(`Imported ${payload.importedCount ?? 0} live jobs into the table.`);
      await refreshJobs();
    } catch {
      setSyncMessage("Unable to run live search right now.");
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <section className="panel p-4 md:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold">Jobs Intelligence Table</h3>
          <p className="text-sm text-muted">Filter, prioritize, and act on your best opportunities.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input value={keywords} onChange={(event) => setKeywords(event.target.value)} placeholder="Keywords" className="field w-44" />
          <input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Location" className="field w-36" />
          <button type="button" className="btn-primary" onClick={() => void runLiveSearch()} disabled={isSearching}>
            {isSearching ? "Searching..." : "Search & Compile"}
          </button>
          <input
            value={globalFilter}
            onChange={(event) => setGlobalFilter(event.target.value)}
            placeholder="Filter table"
            className="field w-44"
          />
        </div>
      </div>

      {syncMessage ? <p className="mb-3 text-sm text-muted">{syncMessage}</p> : null}
      {isLoading ? <p className="mb-3 text-sm text-muted">Loading jobs...</p> : null}

      <div className="overflow-x-auto rounded-xl border border-white/60 bg-white/70">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="bg-white/80 text-left">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className="px-3 py-2 font-semibold text-muted">
                    {header.isPlaceholder ? null : (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1"
                        onClick={header.column.getToggleSortingHandler()}
                        aria-label={`Sort by ${header.column.columnDef.header as string}`}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === "asc" ? (
                          <span className="font-extrabold text-slate-700">↑</span>
                        ) : header.column.getIsSorted() === "desc" ? (
                          <span className="font-extrabold text-slate-700">↓</span>
                        ) : null}
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr className="border-t">
                <td colSpan={columns.length} className="px-3 py-8 text-center text-sm text-muted">
                  No jobs match your search.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="border-t">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-3 align-top">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
        <p>
          Showing {start}-{end} of {totalRows} jobs
        </p>
        <div className="flex items-center gap-2">
          <button className="btn-secondary disabled:opacity-50" onClick={() => { setSelectedJob(null); table.previousPage(); }} disabled={!table.getCanPreviousPage()}>
            Previous
          </button>
          <span>
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() || 1}
          </span>
          <button className="btn-secondary disabled:opacity-50" onClick={() => { setSelectedJob(null); table.nextPage(); }} disabled={!table.getCanNextPage()}>
            Next
          </button>
        </div>
      </div>

      {/* Bug 3: Review detail panel (slide-over drawer) */}
      {selectedJob && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-sm" onClick={() => setSelectedJob(null)}>
          <div
            className="h-full w-full max-w-lg overflow-y-auto bg-white/95 p-6 shadow-2xl backdrop-blur-xl border-l border-white/60"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <h3 className="text-xl font-extrabold">{selectedJob.title}</h3>
                <p className="text-sm text-muted mt-1">{selectedJob.company}</p>
              </div>
              <button onClick={() => setSelectedJob(null)} className="btn-secondary px-3 py-1 text-xs">Close</button>
            </div>

            <div className="space-y-4 text-sm">
              <div className="rounded-xl border border-white/60 bg-white/80 p-4">
                <p className="font-semibold mb-1">Location</p>
                <p className="text-muted">{selectedJob.location} · {selectedJob.workMode}</p>
              </div>
              <div className="rounded-xl border border-white/60 bg-white/80 p-4">
                <p className="font-semibold mb-1">Salary</p>
                <p className="text-muted">{selectedJob.salaryRange || "Not specified"}</p>
              </div>
              <div className="rounded-xl border border-white/60 bg-white/80 p-4">
                <p className="font-semibold mb-1">Match Score</p>
                <p className="text-2xl font-extrabold text-accent">{selectedJob.score}</p>
              </div>
              <div className="rounded-xl border border-white/60 bg-white/80 p-4">
                <p className="font-semibold mb-1">Status</p>
                <p className="text-muted">{selectedJob.status}</p>
              </div>
              <div className="rounded-xl border border-white/60 bg-white/80 p-4">
                <p className="font-semibold mb-1">Priority</p>
                <p className="text-muted">{selectedJob.priority}</p>
              </div>
              <div className="rounded-xl border border-white/60 bg-white/80 p-4">
                <p className="font-semibold mb-1">Source</p>
                <p className="text-muted">{selectedJob.source}</p>
              </div>
              <div className="rounded-xl border border-white/60 bg-white/80 p-4">
                <p className="font-semibold mb-1">Posted</p>
                <p className="text-muted">{selectedJob.postedAt}</p>
              </div>

              {selectedJob.sourceUrl && (
                <a
                  href={selectedJob.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary block text-center mt-4"
                >
                  View Original Listing ↗
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
