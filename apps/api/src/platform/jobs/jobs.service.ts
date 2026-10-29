import {
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, JobStatus, Prisma } from '@prisma/client';
import { EventEmitter } from 'events';
import { PrismaService } from '@platform/db/prisma.service';
import { QueueService } from '@platform/queue/queue.service';
import { EXCHANGES, jobRoutingKey } from '@platform/queue/topology';
import { EnvironmentVariables } from '@platform/config/env.validation';
import {
  JobControl,
  JobEnvelope,
  JobEvent,
  JobEventKind,
  jobEnvelopeSchema,
} from './contracts';
import { ACTIVE_JOB_STATUSES, JobEventContext, JobHooks, TERMINAL_JOB_STATUSES, isActive, isTerminal } from './job-hooks';

export interface EnqueueInput {
  /** "<toolId>.<name>", e.g. "reader.extract" */
  type: string;
  toolId: string;
  userId: string;
  subjectType?: string;
  subjectId?: string;
  payload: Record<string, unknown>;
  parentJobId?: string;
  correlationId?: string;
  maxAttempts?: number;
}

export interface ListJobsFilter {
  subjectType?: string;
  subjectId?: string;
  status?: JobStatus;
  type?: string;
  limit?: number;
}

export interface SweepResult {
  requeued: number;
  failed: number;
}

type HookExtra = Pick<JobEventContext, 'result' | 'error' | 'reason'>;

export interface TimelineEntry {
  at: string;
  status: JobStatus;
  stage: string | null;
}

/** Entries kept per job; enough for a long book, bounded for the row. */
export const TIMELINE_LIMIT = 200;

/** The timeline with one more entry when the stage or the status changed. */
export function nextTimeline(job: Job, status: JobStatus, stage: string | null | undefined, at: Date): TimelineEntry[] {
  const current = (Array.isArray(job.timeline) ? job.timeline : []) as unknown as TimelineEntry[];
  const resolvedStage = stage ?? job.stage ?? null;
  const last = current[current.length - 1];
  if (last && last.status === status && last.stage === resolvedStage) return current;
  return [...current, { at: at.toISOString(), status, stage: resolvedStage }].slice(-TIMELINE_LIMIT);
}

/**
 * The job state machine. The Job row is the source of truth; workers report
 * through events (applyEvent) and the Node runner calls the same method, so
 * both runtimes share one set of transitions and one set of tool hooks.
 */
@Injectable()
export class JobsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(JobsService.name);
  private readonly hooks = new Map<string, JobHooks[]>();
  /** In-process notifications of every row change this service makes (SSE subscribers). */
  readonly changes = new EventEmitter();
  private readonly leaseMs: number;
  private readonly sweepIntervalMs: number;
  private readonly defaultMaxAttempts: number;
  private readonly runsBackground: boolean;
  private sweepTimer?: NodeJS.Timeout;
  private sweeping = false;
  /** job types that run in seconds (the Node runner's): queued longer than the lease means lost */
  private readonly quickTypes = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    config: ConfigService<EnvironmentVariables>,
  ) {
    this.leaseMs = (config.get('JOBS_LEASE_SECONDS', { infer: true }) ?? 900) * 1000;
    this.sweepIntervalMs = (config.get('JOBS_SWEEP_INTERVAL_SECONDS', { infer: true }) ?? 60) * 1000;
    this.defaultMaxAttempts = config.get('JOBS_MAX_ATTEMPTS', { infer: true }) ?? 3;
    this.runsBackground = (config.get('APP_MODE', { infer: true }) ?? 'all') !== 'api';
  }

  /** The Node runner's types: the sweep publishes such a job again when it stayed queued past the lease. */
  registerQuickTypes(types: Iterable<string>): void {
    for (const type of types) this.quickTypes.add(type);
  }

  /** Called by tool modules in onModuleInit. */
  registerHooks(toolId: string, hooks: JobHooks): void {
    const list = this.hooks.get(toolId) ?? [];
    list.push(hooks);
    this.hooks.set(toolId, list);
  }

  onApplicationBootstrap(): void {
    if (!this.runsBackground) return;
    this.sweepTimer = setInterval(() => {
      this.sweep().catch((error: unknown) =>
        this.logger.error(`Sweep failed: ${error instanceof Error ? error.message : String(error)}`),
      );
    }, this.sweepIntervalMs);
    this.sweepTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  // ---- creation and publishing -------------------------------------------------

  /** Creates the row (status queued) without publishing; see publish(). */
  async create(input: EnqueueInput, tx: Prisma.TransactionClient = this.prisma): Promise<Job> {
    return tx.job.create({
      data: {
        type: input.type,
        toolId: input.toolId,
        userId: input.userId,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        payload: input.payload as Prisma.InputJsonValue,
        parentJobId: input.parentJobId,
        correlationId: input.correlationId,
        maxAttempts: input.maxAttempts ?? this.defaultMaxAttempts,
      },
    });
  }

  async enqueue(input: EnqueueInput): Promise<Job> {
    const job = await this.create(input);
    return this.publish(job.id);
  }

  /** Publishes the envelope of a queued job (first delivery, retry or re-publish by the sweep). */
  async publish(jobId: string): Promise<Job> {
    const job = await this.prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    if (!isActive(job.status)) {
      throw new Error(`job ${jobId} is ${job.status} and cannot be published`);
    }
    const envelope: JobEnvelope = jobEnvelopeSchema.parse({
      v: 1,
      jobId: job.id,
      type: job.type,
      toolId: job.toolId,
      userId: job.userId,
      attempt: job.attempts + 1,
      publishedAt: new Date().toISOString(),
      correlationId: job.correlationId,
      payload: job.payload as Record<string, unknown>,
    });
    await this.queue.publish(EXCHANGES.jobs, jobRoutingKey(job.type), envelope, {
      messageId: job.id,
      type: job.type,
    });
    this.logger.log(`Published ${job.type} ${job.id} (attempt ${envelope.attempt})`);
    return job;
  }

  async updatePayload(jobId: string, payload: Record<string, unknown>): Promise<Job> {
    return this.prisma.job.update({
      where: { id: jobId },
      data: { payload: payload as Prisma.InputJsonValue },
    });
  }

  // ---- queries -----------------------------------------------------------------

  async get(userId: string, jobId: string): Promise<Job> {
    const job = await this.prisma.job.findFirst({ where: { id: jobId, userId } });
    if (!job) throw new NotFoundException('Job not found');
    return job;
  }

  async getMany(ids: string[]): Promise<Job[]> {
    if (ids.length === 0) return [];
    return this.prisma.job.findMany({ where: { id: { in: ids } } });
  }

  async list(userId: string, filter: ListJobsFilter = {}): Promise<Job[]> {
    return this.prisma.job.findMany({
      where: {
        userId,
        subjectType: filter.subjectType,
        subjectId: filter.subjectId,
        status: filter.status,
        type: filter.type,
      },
      orderBy: { createdAt: 'desc' },
      take: filter.limit ?? 50,
    });
  }

  async findActive(filter: { type?: string; subjectType?: string; subjectId?: string; userId?: string }): Promise<Job[]> {
    return this.prisma.job.findMany({
      where: { ...filter, status: { in: ['queued', 'running', 'waiting'] } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findChildren(parentJobId: string, status?: JobStatus): Promise<Job[]> {
    return this.prisma.job.findMany({ where: { parentJobId, status }, orderBy: { createdAt: 'asc' } });
  }

  // ---- user actions ------------------------------------------------------------

  async cancel(userId: string, jobId: string, reason = 'cancelled by user'): Promise<Job> {
    const job = await this.get(userId, jobId);
    if (!isActive(job.status)) return job;
    return this.cancelJob(job, reason);
  }

  /** Re-runs a failed or cancelled job from scratch (the handler resumes from its own checkpoints). */
  async retry(userId: string, jobId: string): Promise<Job> {
    const job = await this.get(userId, jobId);
    if (isActive(job.status)) return job;
    const queued = await this.transition(jobId, TERMINAL_JOB_STATUSES, {
        status: 'queued',
        attempts: 0,
        error: null,
        result: Prisma.JsonNull,
        progress: 0,
        stage: null,
        waitReason: null,
        workerId: null,
        heartbeatAt: null,
        startedAt: null,
        finishedAt: null,
        timeline: Prisma.JsonNull,
    });
    if (!queued) return this.get(userId, jobId); // retried meanwhile
    const published = await this.publish(jobId);
    this.notify(published);
    return published;
  }

  async cancelChildren(parentJobId: string, reason: string): Promise<void> {
    const children = await this.prisma.job.findMany({
      where: { parentJobId, status: { in: ['queued', 'running', 'waiting'] } },
    });
    for (const child of children) {
      await this.cancelJob(child, reason);
    }
  }

  /** Cancels every active job about a subject; callers check ownership of the subject first. */
  async cancelForSubject(subjectType: string, subjectId: string, reason: string): Promise<void> {
    const jobs = await this.findActive({ subjectType, subjectId });
    for (const job of jobs) {
      await this.cancelJob(job, reason);
    }
  }

  private async cancelJob(job: Job, reason: string): Promise<Job> {
    const now = new Date();
    const updated = await this.transition(job.id, ACTIVE_JOB_STATUSES, {
      status: 'cancelled',
      error: reason,
      waitReason: null,
      finishedAt: now,
      timeline: nextTimeline(job, 'cancelled', undefined, now) as unknown as Prisma.InputJsonValue,
    });
    if (!updated) return this.prisma.job.findUniqueOrThrow({ where: { id: job.id } }); // finished meanwhile
    await this.publishControl({ v: 1, jobId: job.id, action: 'cancel' });
    await this.cancelChildren(job.id, `parent job ${job.id} cancelled`);
    await this.runHooks(updated, 'cancelled', { error: reason });
    this.notify(updated);
    return updated;
  }

  // ---- transitions driven by workers -------------------------------------------

  /**
   * Applies a worker event to the row and notifies the owning tool. Returns the row after the
   * transition. Every write is a compare-and-set on the status, so events applied out of order
   * (progress after succeeded) or twice never undo a decision another write made.
   */
  async applyEvent(event: JobEvent): Promise<Job | null> {
    const job = await this.prisma.job.findUnique({ where: { id: event.jobId } });
    if (!job) {
      this.logger.warn(`Event ${event.event} for unknown job ${event.jobId} ignored`);
      return null;
    }
    const at = new Date(event.at);
    const extra: HookExtra = { result: event.result, error: event.error, reason: event.reason };
    let updated: Job | null = null;

    switch (event.event) {
      case 'started': {
        if (isTerminal(job.status)) {
          // a duplicate delivery, or a job cancelled while queued: tell the worker to stop
          await this.publishControl({ v: 1, jobId: job.id, action: 'cancel' });
          return job;
        }
        updated = await this.transition(job.id, ACTIVE_JOB_STATUSES, {
          status: 'running',
          workerId: event.workerId,
          attempts: event.attempt ?? job.attempts + 1,
          startedAt: job.startedAt ?? at,
          heartbeatAt: at,
          stage: event.stage ?? job.stage,
          progress: event.progress ?? job.progress,
          waitReason: null,
          error: null,
          timeline: nextTimeline(job, 'running', event.stage, at) as unknown as Prisma.InputJsonValue,
        });
        if (!updated) {
          const current = await this.prisma.job.findUnique({ where: { id: job.id } });
          if (current && isTerminal(current.status)) await this.publishControl({ v: 1, jobId: job.id, action: 'cancel' });
          return current;
        }
        break;
      }
      case 'progress':
      case 'waiting': {
        // only a started run reports progress: a job's events apply in order (JobEventsConsumer), so
        // progress for a queued job is a late heartbeat of a run that failed and was re-queued
        if (job.status !== 'running' && job.status !== 'waiting') return job;
        updated = await this.transition(job.id, ['running', 'waiting'], {
          status: event.event === 'waiting' ? 'waiting' : 'running',
          workerId: event.workerId,
          heartbeatAt: at,
          stage: event.stage ?? job.stage,
          progress: event.progress ?? job.progress,
          waitReason: event.event === 'waiting' ? (event.reason ?? 'waiting') : null,
          timeline: nextTimeline(job, event.event === 'waiting' ? 'waiting' : 'running', event.stage, at) as unknown as Prisma.InputJsonValue,
        });
        break;
      }
      case 'succeeded': {
        if (isTerminal(job.status)) return job;
        updated = await this.transition(job.id, ACTIVE_JOB_STATUSES, {
          status: 'succeeded',
          result: (event.result as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
          progress: 100,
          finishedAt: at,
          heartbeatAt: at,
          waitReason: null,
          error: null,
          timeline: nextTimeline(job, 'succeeded', event.stage, at) as unknown as Prisma.InputJsonValue,
        });
        break;
      }
      case 'failed': {
        if (isTerminal(job.status)) return job;
        const error = event.error ?? 'failed without a message';
        const retryable = event.retryable !== false;
        if (retryable && job.attempts < job.maxAttempts) {
          updated = await this.transition(job.id, ACTIVE_JOB_STATUSES, { status: 'queued', error, workerId: null, heartbeatAt: null, waitReason: null });
          if (updated) {
            this.logger.warn(`Job ${job.id} failed (attempt ${job.attempts}/${job.maxAttempts}), re-queued: ${error}`);
            await this.publish(job.id);
          }
        } else {
          updated = await this.transition(job.id, ACTIVE_JOB_STATUSES, {
            status: 'failed',
            error,
            finishedAt: at,
            waitReason: null,
            timeline: nextTimeline(job, 'failed', event.stage, at) as unknown as Prisma.InputJsonValue,
          });
          if (updated) this.logger.error(`Job ${job.id} failed: ${error}`);
        }
        break;
      }
      case 'cancelled': {
        if (isTerminal(job.status)) return job;
        updated = await this.transition(job.id, ACTIVE_JOB_STATUSES, {
          status: 'cancelled',
          error: event.error ?? 'cancelled by worker',
          finishedAt: at,
          waitReason: null,
          timeline: nextTimeline(job, 'cancelled', event.stage, at) as unknown as Prisma.InputJsonValue,
        });
        break;
      }
    }

    // another write got there first: nothing changed, nothing to tell
    if (!updated) return this.prisma.job.findUnique({ where: { id: job.id } });
    await this.runHooks(updated, event.event, extra);
    this.notify(updated);
    return updated;
  }

  /**
   * Re-publishes running or waiting jobs whose heartbeat is older than the lease
   * (the worker died or lost its connection); marks them failed once the attempts
   * are used up. Handlers are idempotent and checkpointed, so a re-run resumes.
   * Quick jobs (the Node runner's) still queued after the lease were lost before
   * they started and are published again. One sweep at a time; each row changes
   * only if it is still stale when written.
   */
  async sweep(now: Date = new Date()): Promise<SweepResult> {
    const result: SweepResult = { requeued: 0, failed: 0 };
    if (this.sweeping) return result;
    this.sweeping = true;
    try {
      const cutoff = new Date(now.getTime() - this.leaseMs);
      const staleWhere: Prisma.JobWhereInput = { OR: [{ heartbeatAt: { lt: cutoff } }, { heartbeatAt: null, startedAt: { lt: cutoff } }] };
      const stale = await this.prisma.job.findMany({ where: { status: { in: ['running', 'waiting'] }, ...staleWhere } });
      for (const job of stale) {
        if (job.attempts < job.maxAttempts) {
          const requeued = await this.transition(
            job.id,
            ['running', 'waiting'],
            { status: 'queued', error: 'worker lost (no heartbeat within the lease)', workerId: null, heartbeatAt: null, waitReason: null },
            staleWhere,
          );
          if (!requeued) continue; // it reported meanwhile
          this.notify(await this.publish(job.id));
          result.requeued += 1;
          this.logger.warn(`Sweep re-queued ${job.type} ${job.id} (attempt ${job.attempts}/${job.maxAttempts})`);
        } else {
          const error = `worker lost after ${job.attempts} attempt(s)`;
          const updated = await this.transition(job.id, ['running', 'waiting'], { status: 'failed', error, finishedAt: now, waitReason: null }, staleWhere);
          if (!updated) continue;
          result.failed += 1;
          this.logger.error(`Sweep failed ${job.type} ${job.id}: ${error}`);
          await this.runHooks(updated, 'failed', { error });
          this.notify(updated);
        }
      }
      if (this.quickTypes.size > 0) {
        const lostWhere: Prisma.JobWhereInput = { type: { in: [...this.quickTypes] }, updatedAt: { lt: cutoff } };
        for (const job of await this.prisma.job.findMany({ where: { status: 'queued', ...lostWhere } })) {
          // touching the row starts its lease again, so the next sweep does not publish it twice
          if (!(await this.transition(job.id, ['queued'], { updatedAt: now }, lostWhere))) continue;
          await this.publish(job.id);
          result.requeued += 1;
          this.logger.warn(`Sweep published ${job.type} ${job.id} again: still queued after the lease`);
        }
      }
      return result;
    } finally {
      this.sweeping = false;
    }
  }

  // ---- internals ---------------------------------------------------------------

  /**
   * Writes a transition only while the row is still in one of `from` (and matches `where`): a
   * compare-and-set. Null when another write changed the row first.
   */
  private async transition(
    id: string,
    from: readonly JobStatus[],
    data: Prisma.JobUpdateManyMutationInput,
    where: Prisma.JobWhereInput = {},
  ): Promise<Job | null> {
    const { count } = await this.prisma.job.updateMany({ where: { ...where, id, status: { in: [...from] } }, data });
    return count === 1 ? this.prisma.job.findUniqueOrThrow({ where: { id } }) : null;
  }

  private notify(job: Job): void {
    this.changes.emit('job', job);
    this.changes.emit(`job:${job.id}`, job);
  }

  private async publishControl(message: JobControl): Promise<void> {
    try {
      await this.queue.publish(EXCHANGES.control, '', message, { persistent: false });
    } catch (error) {
      this.logger.warn(
        `Could not publish ${message.action} for job ${message.jobId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async runHooks(job: Job, event: JobEventKind, extra: HookExtra): Promise<void> {
    for (const hooks of this.hooks.get(job.toolId) ?? []) {
      try {
        await hooks.onJobEvent({ job, event, ...extra });
      } catch (error) {
        this.logger.error(
          `Hook of ${job.toolId} failed for ${event} of ${job.type} ${job.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}
