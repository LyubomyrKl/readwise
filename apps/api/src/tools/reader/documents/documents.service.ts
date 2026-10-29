import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { createHash } from 'crypto';
import { Book, Prisma } from '@prisma/client';
import { PrismaService } from '@platform/db/prisma.service';
import { StorageService } from '@platform/storage/storage.service';
import { SuccessEmptyResponse } from '@platform/common/models';
import { DocumentFilesService } from './document-files.service';
import {
  SetBookToFavoriteDto,
  UpdateSpentTimeDto,
  UploadBookDto,
  UploadResponse,
  BookResponse,
  UpdateLastAccessedResponse,
  UpdateReadingPositionDto,
} from './document.models';
import { BOOK_CONSTRAINTS, BOOK_ERROR_MESSAGES, BOOK_STATUS } from './document.constants';
import { BOOK_WITH_COUNTS, BookRow, convertBookToResponse } from './document.helpers';

/**
 * Owns the reader_book table and the objects behind it (file, cover,
 * extraction). Other reader sub-modules reach books through this service.
 */
@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly documentFilesService: DocumentFilesService,
  ) {}

  /** The raw row of a book the user owns; 404 otherwise. */
  async getOwnedBook(userId: string, bookId: string): Promise<Book> {
    const book = await this.prisma.book.findFirst({ where: { id: bookId, userId } });
    if (!book) {
      throw new NotFoundException(BOOK_ERROR_MESSAGES.BOOK_NOT_FOUND);
    }
    return book;
  }

  private async findBookRow(bookId: string, userId: string): Promise<BookRow> {
    const book = await this.prisma.book.findFirst({
      where: { id: bookId, userId },
      ...BOOK_WITH_COUNTS,
    });
    if (!book) {
      throw new NotFoundException(BOOK_ERROR_MESSAGES.BOOK_NOT_FOUND);
    }
    return book;
  }

  async uploadBook(
    userId: string,
    files: { book?: Express.Multer.File[]; cover?: Express.Multer.File[] },
    dto: UploadBookDto,
  ): Promise<UploadResponse> {
    const bookFile = files.book?.[0];
    const coverFile = files.cover?.[0];

    if (!bookFile) {
      throw new BadRequestException('Book file is required');
    }
    // a cover is served back as what it claims to be: only images
    if (coverFile && (!BOOK_CONSTRAINTS.COVER_MIME_PATTERN.test(coverFile.mimetype) || coverFile.size > BOOK_CONSTRAINTS.MAX_COVER_SIZE)) {
      throw new BadRequestException(BOOK_ERROR_MESSAGES.COVER_FORMAT_NOT_SUPPORTED);
    }

    const bookStorageKey = this.storage.generateStorageKey(
      userId,
      bookFile.originalname,
      bookFile.mimetype,
    );
    const coverStorageKey = coverFile
      ? this.storage.generateStorageKey(userId, coverFile.originalname, coverFile.mimetype)
      : undefined;

    try {
      await this.storage.putObject('books', bookStorageKey, bookFile.buffer, bookFile.mimetype);
      if (coverFile && coverStorageKey) {
        await this.storage.putObject('covers', coverStorageKey, coverFile.buffer, coverFile.mimetype);
      }

      const sha256 = createHash('sha256').update(bookFile.buffer).digest('hex');

      const book = await this.prisma.book.create({
        data: {
          userId,
          title: dto.title,
          author: dto.author,
          description: dto.description,
          mime: bookFile.mimetype,
          pageCount: dto.pageCount,
          sizeBytes: BigInt(bookFile.size),
          lastAccessed: new Date(),
          fileStorageKey: bookStorageKey,
          customCoverStorageKey: coverStorageKey,
          sha256,
          spentTime: 0,
          status: BOOK_STATUS.READY,
        },
      });

      this.logger.log(`Uploaded and created book ${book.id} for user ${userId}`);
      return { bookId: book.id, status: BOOK_STATUS.READY };
    } catch (error) {
      // storage or database trouble is the server's, not the request's: a 500 (reported), with the
      // reason in the log, and no stored files left behind without their row
      this.logger.error(
        `Failed to upload book for user ${userId}: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
      );
      await Promise.allSettled([
        this.storage.deleteObject('books', bookStorageKey),
        ...(coverStorageKey ? [this.storage.deleteObject('covers', coverStorageKey)] : []),
      ]);
      throw new InternalServerErrorException(BOOK_ERROR_MESSAGES.BOOK_CREATION_FAILED);
    }
  }

  /** All books of the user, newest activity first. */
  async getAllBooks(userId: string): Promise<BookResponse[]> {
    const books = await this.prisma.book.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      ...BOOK_WITH_COUNTS,
    });
    return books.map((book) => convertBookToResponse(book));
  }

  async getBook(userId: string, bookId: string): Promise<BookResponse> {
    const book = await this.findBookRow(bookId, userId);
    return convertBookToResponse(book);
  }

  async setLastAccessed(bookId: string, userId: string): Promise<UpdateLastAccessedResponse> {
    await this.getOwnedBook(userId, bookId);
    await this.prisma.book.update({
      where: { id: bookId },
      data: { lastAccessed: new Date() },
    });
    return { bookId };
  }

  async downloadBook(userId: string, bookId: string, res: Response): Promise<void> {
    await this.documentFilesService.downloadBook(userId, bookId, res);
  }

  async downloadCover(userId: string, bookId: string, res: Response): Promise<void> {
    await this.documentFilesService.downloadCover(userId, bookId, res);
  }

  async updateSpentTime(userId: string, dto: UpdateSpentTimeDto): Promise<SuccessEmptyResponse> {
    const book = await this.getOwnedBook(userId, dto.bookId);
    const spentTime = Number(book.spentTime) + dto.amount;
    await this.prisma.book.update({
      where: { id: dto.bookId },
      data: { spentTime },
    });
    return { status: 'success' };
  }

  async setBookToFavorite(userId: string, dto: SetBookToFavoriteDto): Promise<SuccessEmptyResponse> {
    const book = await this.getOwnedBook(userId, dto.bookId);
    await this.prisma.book.update({
      where: { id: book.id },
      data: { isFavorite: dto.isFavorite },
    });
    return { status: 'success' };
  }

  async updateReadingPosition(
    userId: string,
    dto: UpdateReadingPositionDto,
  ): Promise<SuccessEmptyResponse> {
    await this.getOwnedBook(userId, dto.bookId);
    await this.prisma.book.update({
      where: { id: dto.bookId },
      data: {
        readingPosition: dto.position as unknown as Prisma.InputJsonValue,
        lastAccessed: new Date(),
      },
    });
    return { status: 'success' };
  }

  /** Records where the extraction worker stored the text of a book. */
  async setExtraction(bookId: string, extractionStorageKey: string): Promise<void> {
    await this.prisma.book.update({
      where: { id: bookId },
      data: { extractionStorageKey },
    });
  }

  /**
   * Deletes the book's own objects (file, cover, extraction) and the row;
   * Prisma cascades to notes, highlights and summaries. Objects the summaries
   * sub-module owns are removed by SummariesService.deleteForBook first.
   * Storage failures are logged, not fatal: the row is the source of truth.
   */
  async deleteBook(userId: string, bookId: string): Promise<SuccessEmptyResponse> {
    const book = await this.getOwnedBook(userId, bookId);

    const deletions: Array<[bucket: 'books' | 'covers' | 'extractions', key: string | null]> = [
      ['books', book.fileStorageKey],
      ['covers', book.customCoverStorageKey],
      ['extractions', book.extractionStorageKey],
    ];
    await Promise.all(
      deletions
        .filter((d): d is [typeof d[0], string] => !!d[1])
        .map(async ([bucket, key]) => {
          try {
            await this.storage.deleteObject(bucket, key);
          } catch (err) {
            this.logger.error(`Failed to delete ${bucket}/${key}`, err);
          }
        }),
    );

    await this.prisma.book.delete({ where: { id: bookId } });
    this.logger.log(`Deleted book ${bookId} for user ${userId}`);
    return { status: 'success' };
  }
}
