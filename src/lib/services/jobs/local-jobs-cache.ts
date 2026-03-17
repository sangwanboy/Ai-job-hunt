import type { ApplicationStatus, Priority, WorkMode } from "@/lib/domain/enums";

export type LocalJobRecord = {
  id: string;
  title: string;
  company: string;
  location: string;
  workMode: WorkMode;
  salaryRange: string;
  score: number;
  status: ApplicationStatus;
  priority: Priority;
  source: string;
  postedAt: string;
  sourceUrl?: string;
};

const localState = globalThis as unknown as {
  localJobRecords?: LocalJobRecord[];
};

const cache = localState.localJobRecords ?? [];
localState.localJobRecords = cache;

export const localJobsCache = {
  list(): LocalJobRecord[] {
    return [...cache];
  },
  upsert(job: LocalJobRecord): void {
    const index = cache.findIndex((item) => item.id === job.id);
    if (index >= 0) {
      cache[index] = job;
      return;
    }
    cache.unshift(job);
  },
  upsertMany(jobs: LocalJobRecord[]): void {
    for (const job of jobs) {
      this.upsert(job);
    }
  },
  updateStatus(jobId: string, status: ApplicationStatus): LocalJobRecord | null {
    const index = cache.findIndex((item) => item.id === jobId);
    if (index < 0) {
      return null;
    }
    cache[index] = { ...cache[index], status };
    return cache[index];
  },
};
