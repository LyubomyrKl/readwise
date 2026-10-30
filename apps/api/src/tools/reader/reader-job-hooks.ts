import { Injectable, OnModuleInit } from '@nestjs/common';
import { JobsService } from '@platform/jobs/jobs.service';
import { JobEventContext, JobHooks } from '@platform/jobs/job-hooks';
import { EditionsService, JOB_ABRIDGE, JOB_INGEST, READER_TOOL_ID } from './editions/editions.service';

/**
 * What the reader does when its jobs report back:
 * - reader.ingest succeeded: remember the book's IR (structure, pictures) and language
 * - reader.abridge succeeded: add the edition to the library as a book of its own
 */
@Injectable()
export class ReaderJobHooks implements OnModuleInit, JobHooks {
  constructor(
    private readonly jobs: JobsService,
    private readonly editions: EditionsService,
  ) {}

  onModuleInit(): void {
    this.jobs.registerHooks(READER_TOOL_ID, this);
  }

  async onJobEvent(ctx: JobEventContext): Promise<void> {
    const { job, event } = ctx;
    if ((job.type !== JOB_INGEST && job.type !== JOB_ABRIDGE) || event !== 'succeeded') return;
    const payload = job.payload as Record<string, unknown>;

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
  }
}
