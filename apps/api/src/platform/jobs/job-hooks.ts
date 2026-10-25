import { Job, JobStatus } from '@prisma/client';
import { JobEventKind } from './contracts';

export const ACTIVE_JOB_STATUSES: JobStatus[] = ['queued', 'running', 'waiting'];
export const TERMINAL_JOB_STATUSES: JobStatus[] = ['succeeded', 'failed', 'cancelled'];

export const isActive = (status: JobStatus): boolean => ACTIVE_JOB_STATUSES.includes(status);
export const isTerminal = (status: JobStatus): boolean => TERMINAL_JOB_STATUSES.includes(status);

/** What a tool's hook receives after the platform applied an event to the row. */
export interface JobEventContext {
  /** the job as it is after the transition */
  job: Job;
  event: JobEventKind;
  result?: Record<string, unknown> | null;
  error?: string | null;
  reason?: string | null;
}

/**
 * Implemented by a tool module and registered with JobsService.registerHooks()
 * for its toolId. Called for every event of the tool's jobs, from the events
 * consumer (Python workers) and from the Node runner alike. Errors are logged
 * and do not fail the event.
 */
export interface JobHooks {
  onJobEvent(ctx: JobEventContext): Promise<void>;
}
