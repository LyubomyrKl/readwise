import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RabbitMQService } from '@/infrastructure/rabbitmq/rabbitmq.service';
import { S3Service } from '@/infrastructure/s3/s3.service';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { SummaryRequestResponse, SummaryResponse } from './summarizer.models';
import {
  BOOK_WITH_RELATIONS,
  convertBookToResponse,
} from '@/modules/books/book.helpers';
import { BOOK_ERROR_MESSAGES} from "@/modules/books/book.constants";
import { SummaryType } from '@prisma/client';
import { EnvironmentVariables } from '@/config/env.validation';

@Injectable()
export class SummarizerService {
  private readonly apiBaseUrl: string;

  constructor(
    private readonly rabbitMQService: RabbitMQService,
    private readonly s3Service: S3Service,
    private readonly prisma: PrismaService,
  ) {}

  async requestSummary(
    userId: string,
    bookId: string,
    summaryType: SummaryType,
  ): Promise<SummaryRequestResponse> {
    const book = await this.prisma.book.findFirst({
      where: { id: bookId, userId },
      select: { summaryStorageKey: true },
    });

    if (!book) {
      throw new NotFoundException(BOOK_ERROR_MESSAGES.BOOK_NOT_FOUND);
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
      summaryType
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
      throw new NotFoundException(BOOK_ERROR_MESSAGES.BOOK_NOT_FOUND);
    }

    if (!book.summaryStorageKey) {
      throw new NotFoundException('Summary not available for this book');
    }

    const summary = await this.s3Service.getJsonObject(book.summaryStorageKey);

    const convertedBook = convertBookToResponse(book);

    return {
      ...convertedBook,
      summary,
    };
  }
}
