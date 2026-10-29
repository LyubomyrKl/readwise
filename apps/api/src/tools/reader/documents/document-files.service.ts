import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { pipeline, Readable } from 'stream';
import { Book } from '@prisma/client';
import { PrismaService } from '@platform/db/prisma.service';
import { StorageService } from '@platform/storage/storage.service';
import { BOOK_CONSTRAINTS, BOOK_ERROR_MESSAGES } from './document.constants';

@Injectable()
export class DocumentFilesService {
  private readonly logger = new Logger(DocumentFilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  private async findBookByIdAndUser(bookId: string, userId: string): Promise<Book> {
    const book = await this.prisma.book.findFirst({ where: { id: bookId, userId } });
    if (!book) {
      throw new NotFoundException(BOOK_ERROR_MESSAGES.BOOK_NOT_FOUND);
    }
    return book;
  }

  async downloadBook(userId: string, bookId: string, res: Response): Promise<void> {
    const book = await this.findBookByIdAndUser(bookId, userId);
    const { stream, contentType, contentLength } = await this.storage.getObjectStream(
      'books',
      book.fileStorageKey,
    );

    const filename = book.fileStorageKey.split('-').slice(2).join('-');

    res.setHeader('Content-Type', contentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    this.send(stream, res, `book ${bookId}`);
  }

  async downloadCover(userId: string, bookId: string, res: Response): Promise<void> {
    const book = await this.findBookByIdAndUser(bookId, userId);

    if (!book.customCoverStorageKey) {
      throw new NotFoundException(BOOK_ERROR_MESSAGES.COVER_NOT_FOUND);
    }

    const { stream, contentType, contentLength } = await this.storage.getObjectStream(
      'covers',
      book.customCoverStorageKey,
    );

    // stored before covers were checked: anything but an image is not shown as one
    res.setHeader('Content-Type', contentType && BOOK_CONSTRAINTS.COVER_MIME_PATTERN.test(contentType) ? contentType : 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    this.send(stream, res, `cover of book ${bookId}`);
  }

  /**
   * Streams a stored object to the client. An S3 error mid-body or a client
   * that goes away ends both sides: the response is cut off (never an uncaught
   * error), and the S3 response is destroyed so its socket goes back to the pool.
   */
  private send(stream: ReadableStream, res: Response, what: string): void {
    pipeline(Readable.fromWeb(stream as Parameters<typeof Readable.fromWeb>[0]), res, (error) => {
      if (error && error.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
        this.logger.warn(`download of ${what} failed: ${error.message}`);
      }
    });
  }
}
