import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Book, Edition, EditionFigures, EditionLength, Job, Prisma } from '@prisma/client';
import { PrismaService } from '@platform/db/prisma.service';
import { StorageService } from '@platform/storage/storage.service';
import { JobsService } from '@platform/jobs/jobs.service';
import { toJobResponse } from '@platform/jobs/job.models';
import { isActive } from '@platform/jobs/job-hooks';
import { DocumentsService } from '../documents/documents.service';
import { READER_TOOL_ID } from '../summaries/summaries.service';
import {
  ChapterState,
  CreateEditionDto,
  CreateEditionResponse,
  DocumentStructureResponse,
  EditionProgressResponse,
  EditionResponse,
  EditionState,
} from './edition.models';

export const JOB_INGEST = 'reader.ingest';
export const JOB_ABRIDGE = 'reader.abridge';
export const EDITION_MIME = 'application/epub+zip';

/** Where the worker keeps an edition's manifest and chapters while it works (checkpoints bucket). */
export const editionPrefix = (editionId: string): string => `edition/${editionId}/`;
/** The IR's folder (extractions bucket) from its key: ir/<sha256>/ir-v1.json.gz -> ir/<sha256>/ */
export const irPrefixOf = (irStorageKey: string): string => irStorageKey.slice(0, irStorageKey.lastIndexOf('/') + 1);
/** The structure summary written next to the IR. */
export const structureKeyOf = (irStorageKey: string): string =>
  irStorageKey.replace(/ir-v(\d+)\.json\.gz$/, 'structure-v$1.json');

type EditionWithJob = { edition: Edition; job: Job | null };

/** The part of the worker's manifest (abridge/manifest.py) the progress view reads. */
interface EditionManifest {
  units?: Array<{ id: string; title: string; level: number; kind: string; words?: number }>;
  state?: Record<string, string>;
  overview?: string;
  settings?: { factcheck?: string };
}

const CHAPTER_STATE: Record<string, ChapterState> = { generated: 'written', checked: 'checked', fixed: 'fixed' };

/**
 * Owns reader_edition and the reader's ingest: a book's structure is read once (reader.ingest, on
 * upload), and an edition is a row plus a reader.abridge job. When the job succeeds, complete() adds
 * the EPUB to the library as a book of its own, so the reader, highlights and notes work on it.
 */
@Injectable()
export class EditionsService {
  private readonly logger = new Logger(EditionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly jobs: JobsService,
    private readonly documents: DocumentsService,
  ) {}

  // ---- ingest --------------------------------------------------------------------------

  /** Queues reader.ingest for a new book; a failure here never fails the upload (the edition job reads
   * the structure itself when it is missing). */
  async ingestAfterUpload(userId: string, bookId: string): Promise<void> {
    try {
      const book = await this.documents.getOwnedBook(userId, bookId);
      await this.jobs.enqueue({
        type: JOB_INGEST,
        toolId: READER_TOOL_ID,
        userId,
        subjectType: 'book',
        subjectId: bookId,
        payload: { bookId, fileStorageKey: book.fileStorageKey, mime: book.mime },
      });
    } catch (error) {
      this.logger.warn(`Could not queue ${JOB_INGEST} for book ${bookId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** Called by ReaderJobHooks when reader.ingest (or reader.abridge) reports the IR. */
  async setIngest(bookId: string, irStorageKey: string, language: string | null): Promise<void> {
    await this.prisma.book.update({
      where: { id: bookId },
      data: { irStorageKey, ...(language ? { language } : {}) },
    });
  }

  async structure(userId: string, bookId: string): Promise<DocumentStructureResponse> {
    const book = await this.documents.getOwnedBook(userId, bookId);
    if (!book.irStorageKey) throw new NotFoundException('The structure of this book has not been read yet');
    const structure = await this.storage.getJson('extractions', structureKeyOf(book.irStorageKey));
    return { bookId, structure };
  }

  // ---- editions ------------------------------------------------------------------------

  async create(userId: string, bookId: string, dto: CreateEditionDto = {}): Promise<CreateEditionResponse> {
    const book = await this.documents.getOwnedBook(userId, bookId);
    if (await this.prisma.edition.findFirst({ where: { editionBookId: bookId } })) {
      throw new BadRequestException('This book is itself an abridged edition');
    }
    const length = dto.length ?? EditionLength.standard;
    const figures = dto.figures ?? EditionFigures.key;

    // Idempotency: the same edition, made or in the making, is returned rather than made twice.
    const existing = await this.withJobs(
      await this.prisma.edition.findMany({ where: { bookId, userId, length, figures }, orderBy: { createdAt: 'desc' } }),
    );
    for (const { edition, job } of existing) {
      if (edition.editionBookId) {
        return { editionId: edition.id, jobId: edition.jobId!, existing: true, editionBookId: edition.editionBookId };
      }
      if (job && isActive(job.status)) {
        return { editionId: edition.id, jobId: job.id, existing: true, editionBookId: null };
      }
    }

    const edition = await this.prisma.edition.create({ data: { bookId, userId, length, figures } });
    const job = await this.jobs.create({
      type: JOB_ABRIDGE,
      toolId: READER_TOOL_ID,
      userId,
      subjectType: 'book',
      subjectId: bookId,
      correlationId: edition.id,
      payload: {
        bookId,
        editionId: edition.id,
        fileStorageKey: book.fileStorageKey,
        mime: book.mime,
        title: book.title,
        author: book.author,
        length,
        figures,
      },
    });
    await this.prisma.edition.update({ where: { id: edition.id }, data: { jobId: job.id } });
    await this.jobs.publish(job.id);
    this.logger.log(`Edition ${edition.id} of book ${bookId}: ${length}/${figures}, job ${job.id}`);
    return { editionId: edition.id, jobId: job.id, existing: false, editionBookId: null };
  }

  /**
   * Called by ReaderJobHooks when reader.abridge succeeds: the EPUB becomes a book of the library.
   * Idempotent: a repeated event finds the edition's book already there.
   */
  async complete(editionId: string, result: Record<string, unknown>): Promise<Book | null> {
    const edition = await this.prisma.edition.findUnique({ where: { id: editionId } });
    if (!edition) {
      this.logger.warn(`Edition ${editionId} is gone; its EPUB stays unclaimed in storage`);
      return null;
    }
    if (edition.editionBookId) return this.prisma.book.findUnique({ where: { id: edition.editionBookId } });
    const storageKey = result.storageKey;
    if (typeof storageKey !== 'string' || !storageKey) {
      throw new Error(`reader.abridge for edition ${editionId} succeeded without storageKey`);
    }
    const source = await this.prisma.book.findUnique({ where: { id: edition.bookId } });
    const title = typeof result.title === 'string' && result.title ? result.title : `${source?.title ?? 'Book'} (abridged)`;
    const book = await this.prisma.book.create({
      data: {
        userId: edition.userId,
        title,
        author: source?.author ?? '',
        description: source?.description ?? null,
        mime: EDITION_MIME,
        sizeBytes: BigInt(typeof result.bytes === 'number' ? result.bytes : 0),
        sha256: typeof result.sha256 === 'string' ? result.sha256 : null,
        fileStorageKey: storageKey,
        language: typeof result.language === 'string' ? result.language : null,
        lastAccessed: new Date(),
        spentTime: 0,
        status: 'ready',
      },
    });
    await this.prisma.edition.update({
      where: { id: editionId },
      data: { editionBookId: book.id, result: result as Prisma.InputJsonValue },
    });
    this.logger.log(`Edition ${editionId} ready as book ${book.id}`);
    return book;
  }

  async listForBook(userId: string, bookId: string): Promise<EditionResponse[]> {
    await this.documents.getOwnedBook(userId, bookId);
    const rows = await this.prisma.edition.findMany({ where: { bookId, userId }, orderBy: { createdAt: 'desc' } });
    return (await this.withJobs(rows)).map((pair) => this.toResponse(pair));
  }

  async get(userId: string, editionId: string): Promise<EditionResponse> {
    const edition = await this.prisma.edition.findFirst({ where: { id: editionId, userId } });
    if (!edition) throw new NotFoundException('Edition not found');
    const [pair] = await this.withJobs([edition]);
    return this.toResponse(pair);
  }

  /** Chapter by chapter, from the manifest the worker updates after each chapter and stage. */
  async progress(userId: string, editionId: string): Promise<EditionProgressResponse> {
    const edition = await this.prisma.edition.findFirst({ where: { id: editionId, userId } });
    if (!edition) throw new NotFoundException('Edition not found');
    const [pair] = await this.withJobs([edition]);
    let manifest: EditionManifest | null = null;
    try {
      manifest = await this.storage.getJson<EditionManifest>('checkpoints', `${editionPrefix(editionId)}manifest.json`);
    } catch {
      manifest = null; // not planned yet, or the working files are gone (the edition is finished or deleted)
    }
    const chapters = (manifest?.units ?? []).map((unit) => ({
      id: unit.id,
      title: unit.title,
      level: unit.level,
      divider: unit.kind === 'divider',
      words: unit.words ?? 0,
      state: CHAPTER_STATE[manifest?.state?.[unit.id] ?? ''] ?? ('pending' as ChapterState),
    }));
    const text = chapters.filter((c) => !c.divider);
    return {
      editionId,
      state: this.stateOf(edition, pair.job),
      job: pair.job ? toJobResponse(pair.job) : null,
      chapters,
      totalWords: text.reduce((sum, c) => sum + c.words, 0),
      writtenWords: text.filter((c) => c.state !== 'pending').reduce((sum, c) => sum + c.words, 0),
      overview: !!manifest?.overview,
      factcheck: manifest?.settings?.factcheck ?? null,
    };
  }

  /** Removes what the editions sub-module keeps about a book: the working files of its editions and,
   * when no other book has the same file, its structure and scans. The rows go with the book. */
  async deleteForBook(userId: string, bookId: string): Promise<void> {
    const book = await this.documents.getOwnedBook(userId, bookId);
    const editions = await this.prisma.edition.findMany({ where: { bookId, userId } });
    try {
      for (const edition of editions) {
        const keys = await this.storage.listKeys('checkpoints', editionPrefix(edition.id));
        if (keys.length > 0) await this.storage.deleteObjects('checkpoints', keys);
      }
      if (book.irStorageKey) {
        const others = await this.prisma.book.count({ where: { irStorageKey: book.irStorageKey, id: { not: bookId } } });
        if (others === 0) {
          const prefix = irPrefixOf(book.irStorageKey);
          const keys = await this.storage.listKeys('extractions', prefix);
          if (keys.length > 0) await this.storage.deleteObjects('extractions', keys);
          const sha = prefix.split('/')[1];
          const scans = sha ? await this.storage.listKeys('checkpoints', `ocr/${sha}/`) : [];
          if (scans.length > 0) await this.storage.deleteObjects('checkpoints', scans);
        }
      }
    } catch (error) {
      this.logger.error(`Edition storage cleanup for book ${bookId} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ---- internals -------------------------------------------------------------------------

  private async withJobs(editions: Edition[]): Promise<EditionWithJob[]> {
    const jobs = await this.jobs.getMany(editions.map((e) => e.jobId).filter((id): id is string => !!id));
    const byId = new Map(jobs.map((j) => [j.id, j]));
    return editions.map((edition) => ({ edition, job: edition.jobId ? (byId.get(edition.jobId) ?? null) : null }));
  }

  private stateOf(edition: Edition, job: Job | null): EditionState {
    if (edition.editionBookId) return 'ready';
    switch (job?.status) {
      case 'running':
        return 'running';
      case 'waiting':
        return 'waiting';
      case 'failed':
        return 'failed';
      case 'cancelled':
        return 'cancelled';
      case 'succeeded': // the hook has not added the book (yet): shown as running until it does
        return 'running';
      default:
        return 'queued';
    }
  }

  private toResponse({ edition, job }: EditionWithJob): EditionResponse {
    return {
      id: edition.id,
      bookId: edition.bookId,
      length: edition.length,
      figures: edition.figures,
      state: this.stateOf(edition, job),
      jobId: edition.jobId,
      job: job ? toJobResponse(job) : null,
      editionBookId: edition.editionBookId,
      result: (edition.result as Record<string, unknown> | null) ?? null,
      createdAt: edition.createdAt,
    };
  }
}
