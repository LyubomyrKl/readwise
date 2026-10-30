import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { JobsService } from '@platform/jobs/jobs.service';
import { JobEventContext, JobHooks } from '@platform/jobs/job-hooks';
import { DocumentsService } from '../documents/documents.service';
import { EditionsService, JOB_ABRIDGE, JOB_INGEST } from '../editions/editions.service';
import { JOB_EXTRACT, JOB_SUMMARIZE, READER_TOOL_ID, SummariesService } from './summaries.service';

/**
 * What the reader does when its jobs report back:
 * - reader.extract succeeded: remember the extraction on the book, then publish
 *   the waiting reader.summarize child with the extraction key in its payload
 * - reader.extract ended without success: cancel the child
 * - reader.summarize succeeded: store the summary's storage key
 * - reader.ingest succeeded: remember the book's IR (structure, pictures) and language
 * - reader.abridge succeeded: add the edition to the library as a book of its own
 */
@Injectable()
export class ReaderJobHooks implements OnModuleInit, JobHooks {
  private readonly logger = new Logger(ReaderJobHooks.name);

  constructor(
    private readonly jobs: JobsService,
    private readonly documents: DocumentsService,
    private readonly summaries: SummariesService,
    private readonly editions: EditionsService,
  ) {}

  onModuleInit(): void {
    this.jobs.registerHooks(READER_TOOL_ID, this);
  }

  async onJobEvent(ctx: JobEventContext): Promise<void> {
    const { job, event } = ctx;
    const payload = job.payload as Record<string, unknown>;

    if (job.type === JOB_EXTRACT) {
      if (event === 'succeeded') {
        const key = ctx.result?.extractionStorageKey;
        if (typeof key !== 'string' || !key) {
          throw new Error(`reader.extract ${job.id} succeeded without extractionStorageKey`);
        }
        await this.documents.setExtraction(String(payload.bookId), key);
        for (const child of await this.jobs.findChildren(job.id)) {
          if (child.status === 'succeeded') continue;
          // every child that has not run yet gets the key: the waiting one is published now, and one
          // cancelled or failed meanwhile has it when the user retries it
          const childPayload = child.payload as Record<string, unknown>;
          await this.jobs.updatePayload(child.id, { ...childPayload, extractionStorageKey: key });
          if (child.status === 'queued') await this.jobs.publish(child.id);
        }
        return;
      }
      if (job.status === 'failed' || job.status === 'cancelled') {
        await this.jobs.cancelChildren(job.id, `extraction ${job.status}: ${job.error ?? 'no details'}`);
      }
      return;
    }

    if ((job.type === JOB_INGEST || job.type === JOB_ABRIDGE) && event === 'succeeded') {
      const irKey = ctx.result?.irStorageKey;
      if (typeof irKey === 'string' && irKey) {
        const language = typeof ctx.result?.language === 'string' ? ctx.result.language : null;
        await this.editions.setIngest(String(payload.bookId), irKey, job.type === JOB_INGEST ? language : null);
      }
      if (job.type === JOB_ABRIDGE) {
        const editionId = payload.editionId;
        if (typeof editionId !== 'string' || !ctx.result) {
          throw new Error(`reader.abridge ${job.id} succeeded without editionId/result`);
        }
        await this.editions.complete(editionId, ctx.result);
      }
      return;
    }

    if (job.type === JOB_SUMMARIZE && event === 'succeeded') {
      const key = ctx.result?.storageKey;
      const summaryId = payload.summaryId;
      if (typeof key !== 'string' || !key || typeof summaryId !== 'string') {
        throw new Error(`reader.summarize ${job.id} succeeded without storageKey/summaryId`);
      }
      await this.summaries.setStorageKey(summaryId, key);
      this.logger.log(`Summary ${summaryId} ready at ${key}`);
    }
  }
}
