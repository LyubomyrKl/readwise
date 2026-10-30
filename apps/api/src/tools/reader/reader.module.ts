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
import { EditionsController } from './editions/editions.controller';
import { EditionsService } from './editions/editions.service';
import { ReaderJobHooks } from './reader-job-hooks';

/**
 * The reader tool: documents (library and files), reading (highlights, notes) and
 * editions (the structure read on upload by reader.ingest, abridged editions made by
 * reader.abridge). One NestJS module so the sub-modules share providers without
 * circular module imports; inside the tool the direction is editions -> documents
 * and reading -> documents.
 */
@Module({
  imports: [QueueModule, JobsModule],
  controllers: [DocumentsController, HighlightsController, NotesController, EditionsController],
  providers: [
    DocumentsService,
    DocumentFilesService,
    HighlightsService,
    NotesService,
    EditionsService,
    ReaderJobHooks,
  ],
})
export class ReaderModule {}
