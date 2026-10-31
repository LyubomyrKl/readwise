import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { pipeline, Readable } from 'stream';
import { Book } from '@prisma/client';
import { PrismaService } from '@platform/db/prisma.service';
import { ObjectStream, StorageService, isInvalidRange } from '@platform/storage/storage.service';
import { BOOK_CONSTRAINTS, BOOK_ERROR_MESSAGES } from './document.constants';

/** What a book file is served as; anything else goes out as bytes, never as a type the browser runs. */
const BOOK_TYPES = new Set(['application/pdf', 'application/epub+zip']);

/** One byte range, as readers ask for it (`bytes=0-65535`, `bytes=1000-`, `bytes=-500`); else none. */
export function singleRange(header: string | undefined): string | undefined {
  const match = /^bytes=(\d*)-(\d*)$/.exec((header ?? '').trim());
  if (!match || (!match[1] && !match[2])) return undefined;
  if (match[1] && match[2] && Number(match[1]) > Number(match[2])) return undefined;
  return `bytes=${match[1]}-${match[2]}`;
}

/** The request headers a download honours. */
export interface DownloadConditions {
  range?: string;
  ifRange?: string;
  ifNoneMatch?: string;
}

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

  /**
   * The book file, whole or one byte range of it. The readers load large books a range at a time
   * (PDF.js asks for 64 KiB chunks once it sees `Accept-Ranges: bytes` and a length). A book's file
   * never changes, so its SHA-256 is a strong ETag and the response may be cached for good.
   */
  async downloadBook(userId: string, bookId: string, res: Response, conditions: DownloadConditions = {}): Promise<void> {
    const book = await this.findBookByIdAndUser(bookId, userId);
    const etag = book.sha256 ? `"${book.sha256}"` : undefined;
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (etag) res.setHeader('ETag', etag);

    if (etag && conditions.ifNoneMatch?.split(',').some((tag) => tag.trim() === etag)) {
      res.status(304).end();
      return;
    }
    // If-Range naming another version of the file: the whole file, not a piece of a different one
    const range = conditions.ifRange && conditions.ifRange !== etag ? undefined : singleRange(conditions.range);

    let object: ObjectStream;
    try {
      object = await this.storage.getObjectStream('books', book.fileStorageKey, range);
    } catch (error) {
      if (!range || !isInvalidRange(error)) throw error;
      res.status(416).setHeader('Content-Range', `bytes */${book.sizeBytes}`);
      res.end();
      return;
    }

    const filename = book.fileStorageKey.split('-').slice(2).join('-');
    res.status(range && object.contentRange ? 206 : 200);
    res.setHeader('Content-Type', object.contentType && BOOK_TYPES.has(object.contentType) ? object.contentType : 'application/octet-stream');
    // attachment: an upload is untrusted, and opened directly it must not render on the app's origin
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    if (object.contentLength !== undefined) res.setHeader('Content-Length', object.contentLength);
    if (range && object.contentRange) res.setHeader('Content-Range', object.contentRange);

    this.send(object.stream, res, `book ${bookId}`);
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
