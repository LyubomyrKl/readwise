import { Injectable, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { Readable } from 'stream';
import { Book } from '@prisma/client';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { S3Service } from '@/infrastructure/s3/s3.service';
import { BOOK_ERROR_MESSAGES, BOOK_STATUS } from './book.constants';

@Injectable()
export class BookFilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {}

  private async findReadyBookByIdAndUser(
    bookId: string,
    userId: string,
  ): Promise<Book> {
    const book = await this.prisma.book.findFirst({
      where: { id: bookId, userId, status: BOOK_STATUS.READY },
    });

    if (!book) {
      throw new NotFoundException(BOOK_ERROR_MESSAGES.BOOK_NOT_READY);
    }

    return book;
  }

  async downloadBook(userId: string, bookId: string, res: Response): Promise<void> {
    const book = await this.findReadyBookByIdAndUser(bookId, userId);
    const { stream, contentType, contentLength } = await this.s3.getBookStream(book.fileStorageKey);

    const filename = book.fileStorageKey.split('-').slice(2).join('-');

    res.setHeader('Content-Type', contentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    const nodeStream = Readable.fromWeb(stream as Parameters<typeof Readable.fromWeb>[0]);
    nodeStream.pipe(res);
  }

  async downloadCover(userId: string, bookId: string, res: Response): Promise<void> {
    const book = await this.findReadyBookByIdAndUser(bookId, userId);

    if (!book.customCoverStorageKey) {
      throw new NotFoundException(BOOK_ERROR_MESSAGES.COVER_NOT_FOUND);
    }

    const { stream, contentType, contentLength } = await this.s3.getCoverStream(book.customCoverStorageKey);

    res.setHeader('Content-Type', contentType || 'image/jpeg');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    const nodeStream = Readable.fromWeb(stream as Parameters<typeof Readable.fromWeb>[0]);
    nodeStream.pipe(res);
  }
}
