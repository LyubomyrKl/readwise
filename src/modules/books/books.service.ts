import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { Book } from '@prisma/client';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { S3Service } from '@/infrastructure/s3/s3.service';
import { BookFilesService } from './book.files.service';
import {
  CreateBookDto,
  PresignedUploadDto,
  SetBookToFavoriteDto,
  UpdateSpentTimeDto,
} from './book.models';
import {
  PresignResponse,
  FinalizeResponse,
  BookResponse,
  PresignInfo,
  CoverPresignResponse,
  CoverUpdateDto,
  UpdateLastAccessedResponse,
} from './book.models';
import { BOOK_ERROR_MESSAGES, BOOK_STATUS } from './book.constants';
import { BOOK_WITH_RELATIONS, BookWithRelations } from './book.helpers';
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

  private async findPendingBookByIdAndUser(
    bookId: string,
    userId: string,
  ): Promise<Book> {
    const book = await this.prisma.book.findFirst({
      where: { id: bookId, userId, status: BOOK_STATUS.PENDING },
      ...BOOK_WITH_RELATIONS,
    });

    if (!book) {
      throw new NotFoundException(BOOK_ERROR_MESSAGES.BOOK_ALREADY_FINALIZED);
    }

    return book;
  }

  private async convertBookToResponse(
    book: BookWithRelations,
  ): Promise<BookResponse> {

    return {
      id: book.id,
      title: book.title,
      author: book.author,
      coverUrl: book.customCoverStorageKey
        ? await this.s3.generatePresignedCoverDownloadUrl(
            book.customCoverStorageKey,
          )
        : undefined,
      fileUrl: await this.s3.generatePresignedDownloadUrl(book.fileStorageKey),
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

  async createBookAndPresign(
    userId: string,
    dto: CreateBookDto,
  ): Promise<PresignResponse> {


    const bookFilePresignInfo =
      await this.bookFilesService.generateBookFilePresign(
        userId,
        dto.filename,
        dto.mime,
      );

    let customCover:
      | {
          storageKey: string;
          presignInfo: PresignInfo;
        }
      | undefined;

    if (dto.customCoverFilename && dto.customCoverMime) {
      customCover = await this.bookFilesService.generateCustomCoverPresign(
        userId,
        dto.customCoverFilename,
        dto.customCoverMime,
      );
    }

    try {
      const book = await this.prisma.book.create({
        data: {
          userId,
          title: dto.title,
          author: dto.author,
          customCoverStorageKey: customCover?.storageKey,
          spentTime: 0,
          description: dto.description,
          mime: dto.mime,
          pageCount: dto.pageCount,
          sizeBytes: BigInt(dto.sizeBytes),
          fileStorageKey: bookFilePresignInfo.storageKey,
          status: BOOK_STATUS.PENDING,
        },
      });

      this.logger.log(`Created book ${book.id} for user ${userId}`);

      return {
        bookId: book.id,
        storageKey: bookFilePresignInfo.storageKey,
        presignUploadInfo: bookFilePresignInfo.presignInfo,
        customCoverStorageKey: customCover?.storageKey,
        customCoverPresignInfo: customCover?.presignInfo,
      };
    } catch (error) {
      this.logger.error(`Failed to create book for user ${userId}`, error);
      throw new BadRequestException(BOOK_ERROR_MESSAGES.BOOK_CREATION_FAILED);
    }
  }

  async finalizeBook(
    userId: string,
    bookId: string,
  ): Promise<FinalizeResponse> {
    const book = await this.findPendingBookByIdAndUser(bookId, userId);

    try {
      // Verify book file exists in storage
      await this.bookFilesService.validateFileExists(book.fileStorageKey);

      // Calculate file hash and generate final storage key
      const { sha256, finalStorageKey } =
        await this.bookFilesService.processBookFile(book, userId);

      // Verify custom cover exists if provided
      if (
        book.customCoverStorageKey &&
        typeof book.customCoverStorageKey === 'string'
      ) {
        await this.bookFilesService.validateFileExists(
          book.customCoverStorageKey,
          true,
        );
      }

      // Update book with final details
      await this.prisma.book.update({
        where: { id: bookId },
        data: {
          sha256,
          fileStorageKey: finalStorageKey,
          status: BOOK_STATUS.READY,
        },
      });

      this.logger.log(`Finalized book ${bookId} for user ${userId}`);

      return { bookId, status: BOOK_STATUS.READY };
    } catch (error) {
      this.logger.error(
        `Failed to finalize book ${bookId} for user ${userId}`,
        error,
      );
      throw error;
    }
  }

  async getAllBooks(userId: string): Promise<BookResponse[]> {
    const books = await this.prisma.book.findMany({
      where: {
        userId,
        status: {
          notIn: [BOOK_STATUS.PENDING, BOOK_STATUS.ERROR],
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
      ...BOOK_WITH_RELATIONS,
    });

    return await Promise.all(
      books.map((book) => this.convertBookToResponse(book)),
    );
  }

  async getBook(userId: string, bookId: string): Promise<BookResponse> {
    const book = await this.findBookByIdAndUser(bookId, userId);
    return this.convertBookToResponse(book);
  }

  async setLastAccessed(bookId: string, userId: string): Promise<UpdateLastAccessedResponse> {
    const book = await this.findBookByIdAndUser(bookId, userId);

    if(book){
      await this.prisma.book.update({
        where: { id: bookId },
        data: { lastAccessed: new Date() },
      });
    }

    return { bookId };
  }

  async downloadBook(
    userId: string,
    bookId: string,
    res: Response,
  ): Promise<SuccessEmptyResponse> {
     await this.bookFilesService.downloadBook(userId, bookId, res);
     return { status: 'success'};
  }

  async finalizeCoverUpload(
    userId: string,
    bookId: string,
  ): Promise<SuccessEmptyResponse> {
    return this.bookFilesService.finalizeCoverUpload(userId, bookId);
  }

  async coverPresign(
    userId: string,
    dto: PresignedUploadDto,
  ): Promise<CoverPresignResponse> {
    const response = await this.bookFilesService.generateCustomCoverPresign(
      userId,
      dto.filename,
      dto.mime,
    );

    return {
      storageKey: response.storageKey,
      presignUploadInfo: response.presignInfo,
    };
  }

  async coverUpdateFinalize(
    userId: string,
    dto: CoverUpdateDto,
  ): Promise<FinalizeResponse> {
    await this.findBookByIdAndUser(dto.bookId, userId);

    try {
      await this.prisma.book.update({
        where: { id: dto.bookId },
        data: {
          customCoverStorageKey: dto.storageKey,
          status: BOOK_STATUS.READY,
        },
      });

      this.logger.log(
        `Finalized cover for book ${dto.bookId} for user ${userId}`,
      );

      return { bookId: dto.bookId, status: BOOK_STATUS.READY };
    } catch (error) {
      this.logger.error(
        `Failed to finalize cover for book ${dto.bookId} for user ${userId}`,
        error,
      );
      throw error;
    }
  }

  async updateSpentTime(userId: string, dto: UpdateSpentTimeDto ): Promise<SuccessEmptyResponse> {
    const book = await this.findBookByIdAndUser(dto.bookId, userId);

    const spentTime = Number(book.spentTime) + dto.amount

    try {
      await this.prisma.book.update({
        where: { id: dto.bookId },
        data: {
          spentTime,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to finalize cover for book ${dto.bookId} for user ${userId}`,
        error,
      );
      throw error;
    }
    return { status: 'success' };
  }

   async setBookToFavorite(userId: string, dto: SetBookToFavoriteDto): Promise<SuccessEmptyResponse> {
    const { bookId, isFavorite } = dto;
    const book = await this.findBookByIdAndUser(bookId, userId);
    await this.prisma.book.update({
      where: {
        id: book.id,
      },
      data: {
        isFavorite,
      }
    })
     return  { status: 'success' };
   }
}
