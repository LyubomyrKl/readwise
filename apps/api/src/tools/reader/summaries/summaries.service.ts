import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Job, Summary, SummaryType, SummarizationStrategy } from '@prisma/client';
import { PrismaService } from '@platform/db/prisma.service';
import { StorageService } from '@platform/storage/storage.service';
import { JobsService } from '@platform/jobs/jobs.service';
import { toJobResponse } from '@platform/jobs/job.models';
import { isActive } from '@platform/jobs/job-hooks';
import { DocumentsService } from '../documents/documents.service';
import {
  CreateSummaryResponse,
  SummaryContentResponse,
  SummaryResponse,
  SummaryState,
} from './summary.models';

export const READER_TOOL_ID = 'reader';
export const JOB_EXTRACT = 'reader.extract';
export const JOB_SUMMARIZE = 'reader.summarize';
export const DEFAULT_SUMMARY_PERCENT = 0.4;

/** Checkpoints are keyed by book and summary type (see the summarize handler). */
export const checkpointPrefix = (bookId: string): string => `checkpoint/${bookId}_`;
/** Where the worker stores finished summaries: summary/<bookId>/<summaryId>.json */
export const summaryObjectPrefix = (bookId: string): string => `summary/${bookId}/`;

type SummaryWithJob = { summary: Summary; job: Job | null };

/**
 * Owns reader_summary. A summary is a row plus up to two jobs: reader.extract
 * (skipped when the book already has an extraction) and reader.summarize, its
 * child. The worker stores the JSON and reports the key; ReaderJobHooks writes
 * it to the row.
 */
@Injectable()
export class SummariesService {
  private readonly logger = new Logger(SummariesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly jobs: JobsService,
    private readonly documents: DocumentsService,
  ) {}

  // ---- commands ------------------------------------------------------------------

  async create(
    userId: string,
    bookId: string,
    type: SummaryType = SummaryType.abstractive,
    strategy: SummarizationStrategy = SummarizationStrategy.structured,
    percent: number = DEFAULT_SUMMARY_PERCENT,
  ): Promise<CreateSummaryResponse> {
    const book = await this.documents.getOwnedBook(userId, bookId);

    // Idempotency: the same summary finished or still in progress is returned, not re-queued.
    const existing = await this.withJobs(
      await this.prisma.summary.findMany({
        where: { bookId, userId, type, strategy },
        orderBy: { createdAt: 'desc' },
      }),
    );
    for (const { summary, job } of existing) {
      const storageKey = this.storageKeyOf(summary, job);
      if (storageKey) {
        return { summaryId: summary.id, jobId: summary.jobId!, existing: true, storageKey };
      }
      if (job && isActive(job.status)) {
        return { summaryId: summary.id, jobId: job.id, extractJobId: job.parentJobId, existing: true, storageKey: null };
      }
    }

    const summary = await this.prisma.summary.create({
      data: { bookId, userId, type, strategy, percent },
    });

    const summarizePayload = {
      bookId,
      summaryId: summary.id,
      extractionStorageKey: book.extractionStorageKey,
      summaryType: type,
      strategy,
      summaryPercent: percent,
      title: book.title,
    };

    let extractJob: Job | null = null;
    if (!book.extractionStorageKey) {
      extractJob = await this.jobs.create({
        type: JOB_EXTRACT,
        toolId: READER_TOOL_ID,
        userId,
        subjectType: 'book',
        subjectId: bookId,
        correlationId: summary.id,
        payload: { bookId, fileStorageKey: book.fileStorageKey, mime: book.mime, title: book.title },
      });
    }
    const summarizeJob = await this.jobs.create({
      type: JOB_SUMMARIZE,
      toolId: READER_TOOL_ID,
      userId,
      subjectType: 'book',
      subjectId: bookId,
      correlationId: summary.id,
      parentJobId: extractJob?.id,
      payload: summarizePayload,
    });
    await this.prisma.summary.update({ where: { id: summary.id }, data: { jobId: summarizeJob.id } });

    // The child waits for the extraction (ReaderJobHooks publishes it); otherwise go straight to summarizing.
    await this.jobs.publish(extractJob ? extractJob.id : summarizeJob.id);
    this.logger.log(
      `Summary ${summary.id} for book ${bookId}: ${type}/${strategy}, jobs ${extractJob?.id ?? '-'} -> ${summarizeJob.id}`,
    );

    return {
      summaryId: summary.id,
      jobId: summarizeJob.id,
      extractJobId: extractJob?.id ?? null,
      existing: false,
      storageKey: null,
    };
  }

  /** Called by ReaderJobHooks when reader.summarize succeeds. */
  async setStorageKey(summaryId: string, storageKey: string): Promise<void> {
    await this.prisma.summary.update({ where: { id: summaryId }, data: { storageKey } });
  }

  /** Removes everything the summaries sub-module owns about a book; the caller deletes the book itself. */
  async deleteForBook(userId: string, bookId: string): Promise<void> {
    await this.documents.getOwnedBook(userId, bookId);
    await this.jobs.cancelForSubject('book', bookId, 'book deleted');
    const summaries = await this.prisma.summary.findMany({ where: { bookId, userId } });
    const keys = new Set<string>(summaries.map((s) => s.storageKey).filter((k): k is string => !!k));
    try {
      for (const key of await this.storage.listKeys('summaries', summaryObjectPrefix(bookId))) keys.add(key);
      if (keys.size > 0) await this.storage.deleteObjects('summaries', [...keys]);
      const checkpoints = await this.storage.listKeys('checkpoints', checkpointPrefix(bookId));
      if (checkpoints.length > 0) await this.storage.deleteObjects('checkpoints', checkpoints);
    } catch (error) {
      this.logger.error(`Storage cleanup for book ${bookId} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    // rows go with the book (ON DELETE CASCADE)
  }

  // ---- queries -------------------------------------------------------------------

  async listForBook(userId: string, bookId: string): Promise<SummaryResponse[]> {
    await this.documents.getOwnedBook(userId, bookId);
    const rows = await this.prisma.summary.findMany({ where: { bookId, userId }, orderBy: { createdAt: 'desc' } });
    return (await this.withJobs(rows)).map((pair) => this.toResponse(pair));
  }

  async get(userId: string, summaryId: string): Promise<SummaryResponse> {
    return this.toResponse(await this.loadOwned(userId, summaryId));
  }

  /** Every summary of the user, newest first; with latestPerBook only the newest of each document. */
  async listForUser(
    userId: string,
    opts: { latestPerBook?: boolean; limit?: number } = {},
  ): Promise<SummaryResponse[]> {
    const rows = await this.prisma.summary.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
    let selected = rows;
    if (opts.latestPerBook) {
      const seen = new Set<string>();
      selected = rows.filter((row) => (seen.has(row.bookId) ? false : (seen.add(row.bookId), true)));
    }
    selected = selected.slice(0, opts.limit ?? 100);
    return (await this.withJobs(selected)).map((pair) => this.toResponse(pair));
  }

  async getContent(userId: string, summaryId: string): Promise<SummaryContentResponse> {
    const pair = await this.loadOwned(userId, summaryId);
    const storageKey = this.storageKeyOf(pair.summary, pair.job);
    if (!storageKey) {
      throw new NotFoundException('Summary is not ready');
    }
    const summary = await this.storage.getJson('summaries', storageKey);
    return { ...this.toResponse(pair), summary };
  }

  // ---- internals -----------------------------------------------------------------

  private async loadOwned(userId: string, summaryId: string): Promise<SummaryWithJob> {
    const summary = await this.prisma.summary.findFirst({ where: { id: summaryId, userId } });
    if (!summary) throw new NotFoundException('Summary not found');
    const [pair] = await this.withJobs([summary]);
    return pair;
  }

  private async withJobs(summaries: Summary[]): Promise<SummaryWithJob[]> {
    const jobs = await this.jobs.getMany(summaries.map((s) => s.jobId).filter((id): id is string => !!id));
    const byId = new Map(jobs.map((j) => [j.id, j]));
    return summaries.map((summary) => ({ summary, job: summary.jobId ? (byId.get(summary.jobId) ?? null) : null }));
  }

  /** The row's key, or the key the job reported if the hook did not get to write it. */
  private storageKeyOf(summary: Summary, job: Job | null): string | null {
    if (summary.storageKey) return summary.storageKey;
    if (job?.status === 'succeeded') {
      const key = (job.result as { storageKey?: unknown } | null)?.storageKey;
      if (typeof key === 'string' && key) return key;
    }
    return null;
  }

  private stateOf(summary: Summary, job: Job | null): SummaryState {
    if (this.storageKeyOf(summary, job)) return 'ready';
    switch (job?.status) {
      case 'running':
        return 'running';
      case 'waiting':
        return 'waiting';
      case 'failed':
        return 'failed';
      case 'cancelled':
        return 'cancelled';
      case 'succeeded': // succeeded without a key: treat as failed, the worker broke the contract
        return 'failed';
      default:
        return 'queued';
    }
  }

  private toResponse({ summary, job }: SummaryWithJob): SummaryResponse {
    return {
      id: summary.id,
      bookId: summary.bookId,
      type: summary.type,
      strategy: summary.strategy,
      percent: summary.percent,
      storageKey: this.storageKeyOf(summary, job),
      jobId: summary.jobId,
      state: this.stateOf(summary, job),
      job: job ? toJobResponse(job) : null,
      createdAt: summary.createdAt,
    };
  }
}
