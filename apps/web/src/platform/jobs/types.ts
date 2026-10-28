/** Mirrors apps/api/src/platform/jobs/job.models.ts */

export type JobStatus = "queued" | "running" | "waiting" | "succeeded" | "failed" | "cancelled";

export const ACTIVE_JOB_STATUSES: readonly JobStatus[] = ["queued", "running", "waiting"];

export function isActiveJob(status: JobStatus | undefined | null): boolean {
  return !!status && ACTIVE_JOB_STATUSES.includes(status);
}

export interface JobResponse {
  id: string;
  /** "<toolId>.<name>", e.g. "reader.summarize" */
  type: string;
  toolId: string;
  userId: string;
  subjectType?: string | null;
  subjectId?: string | null;
  status: JobStatus;
  /** free text from the worker, e.g. "section 3/12" */
  stage?: string | null;
  /** 0-100 */
  progress: number;
  /** why the job waits (status = waiting), e.g. the LLM host is unreachable */
  waitReason?: string | null;
  error?: string | null;
  attempts: number;
  maxAttempts: number;
  workerId?: string | null;
  heartbeatAt?: string | null;
  parentJobId?: string | null;
  correlationId?: string | null;
  result?: Record<string, unknown> | null;
  /** stage and status changes in order */
  timeline?: Array<{ at: string; status: JobStatus; stage: string | null }>;
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
}

/** A type alias (not an interface) so it can be passed as a query object. */
export type ListJobsFilter = {
  subjectType?: string;
  subjectId?: string;
  status?: JobStatus;
  type?: string;
  limit?: number;
};

/** "12m 05s" between two timestamps, or null when either is missing. */
export function jobDuration(job: Pick<JobResponse, "startedAt" | "finishedAt">): string | null {
  if (!job.startedAt || !job.finishedAt) return null;
  const ms = new Date(job.finishedAt).getTime() - new Date(job.startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : m > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}
