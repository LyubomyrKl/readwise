import { Injectable, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { Readable } from 'stream';
import { Book } from '@prisma/client';
import { PrismaService } from '@platform/db/prisma.service';
import { StorageService } from '@platform/storage/storage.service';
import { BOOK_ERROR_MESSAGES } from './document.constants';

@Injectable()
export class DocumentFilesService {
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

    Readable.fromWeb(stream as Parameters<typeof Readable.fromWeb>[0]).pipe(res);
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

    res.setHeader('Content-Type', contentType || 'image/jpeg');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    Readable.fromWeb(stream as Parameters<typeof Readable.fromWeb>[0]).pipe(res);
  }
}
