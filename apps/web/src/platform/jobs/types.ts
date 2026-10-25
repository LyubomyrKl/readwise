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
