import { Module } from '@nestjs/common';
import { QueueModule } from '@platform/queue/queue.module';
import { JobsModule } from '@platform/jobs/jobs.module';
import { DocumentsController } from './documents/documents.controller';
import { DocumentsService } from './documents/documents.service';
import { DocumentFilesService } from './documents/document-files.service';
import { HighlightsController } from './reading/highlights.controller';
import { HighlightsService } from './reading/highlights.service';
import { NotesController } from './reading/notes.controller';
import { NotesService } from './reading/notes.service';
import { SummariesController } from './summaries/summaries.controller';
import { SummariesService } from './summaries/summaries.service';
import { ReaderJobHooks } from './summaries/reader-job-hooks';

/**
 * The reader tool: documents (library and files), reading (highlights, notes)
 * and summaries (rows plus reader.extract / reader.summarize jobs). One NestJS
 * module so the sub-modules share providers without circular module imports;
 * inside the tool the direction is summaries -> documents and reading -> documents.
 */
@Module({
  imports: [QueueModule, JobsModule],
  controllers: [
    DocumentsController,
    HighlightsController,
    NotesController,
    SummariesController,
  ],
  providers: [
    DocumentsService,
    DocumentFilesService,
    HighlightsService,
    NotesService,
    SummariesService,
    ReaderJobHooks,
  ],
})
export class ReaderModule {}
