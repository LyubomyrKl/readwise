import { Injectable, NotFoundException } from '@nestjs/common';
import { RabbitMQService } from '@/infrastructure/rabbitmq/rabbitmq.service';
import { S3Service } from '@/infrastructure/s3/s3.service';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { SummaryRequestResponse, SummaryResponse } from './summarizer.models';
import {
  BOOK_WITH_RELATIONS,
  BookWithRelations,
} from '@/modules/books/book.helpers';
import { BookResponse } from '@/modules/books/book.models';

@Injectable()
export class SummarizerService {
  constructor(
    private readonly rabbitMQService: RabbitMQService,
    private readonly s3Service: S3Service,
    private readonly prisma: PrismaService,
  ) {}

  private async convertBookToResponse(
    book: BookWithRelations,
  ): Promise<BookResponse> {

    return {
      id: book.id,
      title: book.title,
      author: book.author,
      coverUrl: book.customCoverStorageKey
        ? await this.s3Service.generatePresignedCoverDownloadUrl(
          book.customCoverStorageKey,
        )
        : undefined,
      fileUrl: await this.s3Service.generatePresignedDownloadUrl(book.fileStorageKey),
      description: book.description,
      spentTime: book.spentTime,
      pageCount: book.pageCount,
      pagePassCount: book.pagePassCount,
      summaryKey: book.summaryStorageKey,
      lastAccessed: book.lastAccessed,
      isFinished: book.isFinished,
      isFavorite: book.isFavorite,
      mime: book.mime,
      sizeBytes: book.sizeBytes.toString(),
      status: book.status,
      notes: book.notes || [],
      highlights: book.highlights || [],
      tags: book.tags || [],
      createdAt: book.createdAt,
      updatedAt: book.updatedAt,
    };
  }

  async requestSummary(
    userId: string,
    bookId: string,
  ): Promise<SummaryRequestResponse> {
    const book = await this.prisma.book.findFirst({
      where: { id: bookId, userId },
      select: { summaryStorageKey: true },
    });

    if (!book) {
      throw new NotFoundException('Book not found');
    }

    if (book.summaryStorageKey) {
      return {
        success: true,
        message: 'Summary already exists',
        userId,
        bookId,
        summaryKey: book.summaryStorageKey,
      };
    }

    const result = await this.rabbitMQService.publishSummaryRequest(
      userId,
      bookId,
    );

    return {
      success: result.success,
      message: result.message,
      userId,
      bookId,
    };
  }

  async getSummaryByBookId(userId: string, bookId: string): Promise<SummaryResponse> {
    const book = await this.prisma.book.findFirst({
      where: { id: bookId, userId },
      ...BOOK_WITH_RELATIONS,
    });

    if (!book) {
      throw new NotFoundException('Book not found');
    }

    if (!book.summaryStorageKey) {
      throw new NotFoundException('Summary not available for this book');
    }

    const summary = await this.s3Service.getJsonObject(book.summaryStorageKey);

    const convertedBook = await this.convertBookToResponse(book);

    return {
      ...convertedBook,
      summary,
    };
  }
}
