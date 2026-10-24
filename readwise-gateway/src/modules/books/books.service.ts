import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { S3Service } from '@/infrastructure/s3/s3.service';
import { BookFilesService } from './book.files.service';
import {
  SetBookToFavoriteDto,
  UpdateSpentTimeDto,
  UploadBookDto,
  UploadResponse,
  BookResponse,
  UpdateLastAccessedResponse,
  UpdateReadingPositionDto,
} from './book.models';
import { BOOK_ERROR_MESSAGES, BOOK_STATUS } from './book.constants';
import { BOOK_WITH_RELATIONS, BookWithRelations, convertBookToResponse } from './book.helpers';
import { SuccessEmptyResponse } from '@/app.models';

@Injectable()
export class BooksService {
  private readonly logger = new Logger(BooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly bookFilesService: BookFilesService,
  ) {}

  private async findBookByIdAndUser(
    bookId: string,
    userId: string,
  ): Promise<BookWithRelations> {
    const book = await this.prisma.book.findFirst({
      where: { id: bookId, userId },
      ...BOOK_WITH_RELATIONS,
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

    const bookStorageKey = this.s3.generateStorageKey(
      userId,
      bookFile.originalname,
      bookFile.mimetype,
    );

    let coverStorageKey: string | undefined;
    if (coverFile) {
      coverStorageKey = this.s3.generateCoverStorageKey(
        userId,
        coverFile.originalname,
        coverFile.mimetype,
      );
    }

    try {
      await this.s3.uploadObject(bookStorageKey, bookFile.buffer, bookFile.mimetype);

      if (coverFile && coverStorageKey) {
        await this.s3.uploadCoverObject(coverStorageKey, coverFile.buffer, coverFile.mimetype);
      }

      const hash = createHash('sha256');
      hash.update(bookFile.buffer);
      const sha256 = hash.digest('hex');

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
      this.logger.error(`Failed to upload book for user ${userId}`, error);
      throw new BadRequestException(BOOK_ERROR_MESSAGES.BOOK_CREATION_FAILED);
    }
  }

  async getAllBooks(userId: string): Promise<BookResponse[]> {
    const books = await this.prisma.book.findMany({
      where: {
        userId,
        // Books whose processing failed stay listed so the user can retry or delete them.
        status: {
          not: BOOK_STATUS.PENDING,
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
      ...BOOK_WITH_RELATIONS,
    });

    return books.map((book) => convertBookToResponse(book));
  }

  async getBook(userId: string, bookId: string): Promise<BookResponse> {
    const book = await this.findBookByIdAndUser(bookId, userId);
    return convertBookToResponse(book);
  }

  async setLastAccessed(bookId: string, userId: string): Promise<UpdateLastAccessedResponse> {
    await this.findBookByIdAndUser(bookId, userId);

    await this.prisma.book.update({
      where: { id: bookId },
      data: { lastAccessed: new Date() },
    });

    return { bookId };
  }

  async downloadBook(
    userId: string,
    bookId: string,
    res: Response,
  ): Promise<void> {
    await this.bookFilesService.downloadBook(userId, bookId, res);
  }

  async downloadCover(
    userId: string,
    bookId: string,
    res: Response,
  ): Promise<void> {
    await this.bookFilesService.downloadCover(userId, bookId, res);
  }

  async updateSpentTime(userId: string, dto: UpdateSpentTimeDto): Promise<SuccessEmptyResponse> {
    const book = await this.findBookByIdAndUser(dto.bookId, userId);
    const spentTime = Number(book.spentTime) + dto.amount;

    try {
      await this.prisma.book.update({
        where: { id: dto.bookId },
        data: { spentTime },
      });
    } catch (error) {
      this.logger.error(`Failed to update spent time for book ${dto.bookId}`, error);
      throw error;
    }
    return { status: 'success' };
  }

  async setBookToFavorite(userId: string, dto: SetBookToFavoriteDto): Promise<SuccessEmptyResponse> {
    const { bookId, isFavorite } = dto;
    const book = await this.findBookByIdAndUser(bookId, userId);
    await this.prisma.book.update({
      where: { id: book.id },
      data: { isFavorite },
    });
    return { status: 'success' };
  }

  async updateReadingPosition(userId: string, dto: UpdateReadingPositionDto): Promise<SuccessEmptyResponse> {
    const { bookId, position } = dto;
    await this.findBookByIdAndUser(bookId, userId);

    await this.prisma.book.update({
      where: { id: bookId },
      data: {
        readingPosition: position as unknown as Prisma.InputJsonValue,
        lastAccessed: new Date(),
      },
    });

    return { status: 'success' };
  }

  async deleteBook(userId: string, bookId: string): Promise<SuccessEmptyResponse> {
    const book = await this.findBookByIdAndUser(bookId, userId);

    // Delete S3 files - log errors but continue with DB deletion
    // Orphaned S3 files can be cleaned up later; DB consistency is critical
    const s3Deletions: Promise<void>[] = [];
    const failedKeys: string[] = [];

    if (book.fileStorageKey) {
      s3Deletions.push(
        this.s3.deleteObject(book.fileStorageKey).catch((err) => {
          failedKeys.push(book.fileStorageKey);
          this.logger.error(`Failed to delete book file ${book.fileStorageKey}`, err);
        }),
      );
    }

    if (book.customCoverStorageKey) {
      s3Deletions.push(
        this.s3.deleteCoverObject(book.customCoverStorageKey).catch((err) => {
          failedKeys.push(book.customCoverStorageKey!);
          this.logger.error(`Failed to delete cover ${book.customCoverStorageKey}`, err);
        }),
      );
    }

    if (book.summaryStorageKey) {
      s3Deletions.push(
        this.s3.deleteSummaryObject(book.summaryStorageKey).catch((err) => {
          failedKeys.push(book.summaryStorageKey!);
          this.logger.error(`Failed to delete summary ${book.summaryStorageKey}`, err);
        }),
      );
    }

    if (book.extractionStorageKey) {
      s3Deletions.push(
        this.s3.deleteSummaryObject(book.extractionStorageKey).catch((err) => {
          failedKeys.push(book.extractionStorageKey!);
          this.logger.error(`Failed to delete extraction ${book.extractionStorageKey}`, err);
        }),
      );
    }

    await Promise.all(s3Deletions);

    // Delete database record (Prisma cascade handles relations)
    await this.prisma.book.delete({
      where: { id: bookId },
    });

    this.logger.log(`Deleted book ${bookId} for user ${userId}`);

    return { status: 'success' };
  }
}
