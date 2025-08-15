import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { createHash } from 'crypto';
import type { Response } from 'express';
import { Book } from '@prisma/client';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { S3Service } from '@/infrastructure/s3/s3.service';
import { CreateBookDto } from './book.dto';
import {
  PresignResponse,
  FinalizeResponse,
  BookResponse,
  DownloadResponse,
  DownloadHeaders,
  CoverPresignResponse,
  PresignInfo,
} from './book.models';
import { BOOK_ERROR_MESSAGES, BOOK_STATUS } from './book.constants';

@Injectable()
export class BooksService {
  private readonly logger = new Logger(BooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {}

  private async findBookByIdAndUser(
    bookId: string,
    userId: string,
  ): Promise<Book> {
    const book = await this.prisma.book.findFirst({
      where: { id: bookId, userId },
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
    });

    if (!book) {
      throw new NotFoundException(BOOK_ERROR_MESSAGES.BOOK_ALREADY_FINALIZED);
    }

    return book;
  }

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

  private async generateCustomCoverPresign(
    userId: string,
    filename: string,
    mime: string,
    sizeBytes: number,
  ): Promise<{
    storageKey: string;
    presignInfo: PresignInfo;
  }> {
    const storageKey = this.s3.generateCoverStorageKey(userId, filename);

    const presignInfo = await this.s3.generatePresignedCoverUploadUrl(
      storageKey,
      mime,
      sizeBytes,
    );

    if (!presignInfo) {
      throw new BadRequestException(BOOK_ERROR_MESSAGES.PRESIGN_FAILED);
    }

    return { storageKey, presignInfo };
  }

  private async validateFileExists(
    storageKey: string,
    isCover = false,
  ): Promise<void> {
    const exists = isCover
      ? await this.s3.coverObjectExists(storageKey)
      : await this.s3.objectExists(storageKey);

    if (!exists) {
      const message = isCover
        ? BOOK_ERROR_MESSAGES.COVER_NOT_FOUND
        : BOOK_ERROR_MESSAGES.FILE_NOT_FOUND;
      throw new BadRequestException(message);
    }
  }

  private convertBookToResponse(book: Book): BookResponse {
    return {
      id: book.id,
      title: book.title,
      author: book.author,
      customStorageKey: book.customCoverStorageKey,
      spentHours: book.spentHours,
      pageCount: book.pageCount,
      pagePassCount: book.pagePassCount,
      isFinished: book.isFinished,
      isFavorite: book.isFavorite,
      mime: book.mime,
      sizeBytes: book.sizeBytes.toString(),
      status: book.status,
      createdAt: book.createdAt,
      updatedAt: book.updatedAt,
    };
  }

  async createBookAndPresign(
    userId: string,
    dto: CreateBookDto,
  ): Promise<PresignResponse> {
    const temporaryStorageKey = this.s3.generateStorageKey(
      userId,
      dto.filename,
      'temp',
    );

    let customCover:
      | {
          storageKey: string;
          presignInfo: PresignInfo;
        }
      | undefined;

    // Handle custom cover upload if provided
    if (
      dto.customCoverFilename &&
      dto.customCoverMime &&
      dto.customCoverSizeBytes
    ) {
      customCover = await this.generateCustomCoverPresign(
        userId,
        dto.customCoverFilename,
        dto.customCoverMime,
        dto.customCoverSizeBytes,
      );
    }

    try {
      const book = await this.prisma.book.create({
        data: {
          userId,
          title: dto.title,
          author: dto.author,
          customCoverStorageKey: customCover?.storageKey,
          description: dto.description,
          mime: dto.mime,
          sizeBytes: BigInt(dto.sizeBytes),
          fileStorageKey: temporaryStorageKey,
          status: BOOK_STATUS.PENDING,
        },
      });

      const presignUploadInfo = await this.s3.generatePresignedUploadUrl(
        temporaryStorageKey,
        dto.mime,
        dto.sizeBytes,
      );

      if (!presignUploadInfo) {
        throw new BadRequestException(BOOK_ERROR_MESSAGES.PRESIGN_FAILED);
      }

      this.logger.log(`Created book ${book.id} for user ${userId}`);

      return {
        bookId: book.id,
        storageKey: temporaryStorageKey,
        presignUploadInfo,
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
      await this.validateFileExists(book.fileStorageKey);

      // Calculate file hash and generate final storage key
      const { sha256, finalStorageKey } = await this.processBookFile(
        book,
        userId,
      );

      // Verify custom cover exists if provided
      if (
        book.customCoverStorageKey &&
        typeof book.customCoverStorageKey === 'string'
      ) {
        await this.validateFileExists(book.customCoverStorageKey, true);
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

  private async processBookFile(
    book: Book,
    userId: string,
  ): Promise<{ sha256: string; finalStorageKey: string }> {
    // Download file and calculate SHA256 hash
    const fileBuffer = await this.s3.getObjectBuffer(book.fileStorageKey);
    const hash = createHash('sha256');
    hash.update(fileBuffer);
    const sha256 = hash.digest('hex');

    // Extract original filename from temporary key
    const tempFilename = book.fileStorageKey.split('/').pop()!;
    const originalFilename = tempFilename.substring(
      0,
      tempFilename.lastIndexOf('-'),
    );

    const finalStorageKey = this.s3.generateStorageKey(
      userId,
      originalFilename,
      sha256,
    );

    // Move file to final location if different
    if (finalStorageKey !== book.fileStorageKey) {
      await this.s3.copyObject(book.fileStorageKey, finalStorageKey);
      await this.s3.deleteObject(book.fileStorageKey);
    }

    return { sha256, finalStorageKey };
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
    });

    return books.map((book) => this.convertBookToResponse(book));
  }

  async getBook(userId: string, bookId: string): Promise<BookResponse> {
    const book = await this.findBookByIdAndUser(bookId, userId);
    return this.convertBookToResponse(book);
  }

  async downloadBook(
    userId: string,
    bookId: string,
    range: string | undefined,
    res: Response,
  ): Promise<void> {
    const book = await this.findReadyBookByIdAndUser(bookId, userId);

    try {
      // Get object metadata
      const metadata = await this.s3.getObjectMetadata(book.fileStorageKey);
      const contentLength = metadata.ContentLength || 0;

      // Generate presigned URL
      const downloadUrl = await this.s3.generatePresignedDownloadUrl(
        book.fileStorageKey,
      );

      // Prepare headers
      const headers: DownloadHeaders = {
        'Content-Type': book.mime,
        'Accept-Ranges': 'bytes',
        'Content-Disposition': `attachment; filename="${book.title}"`,
        'Content-Length': contentLength.toString(),
        Location: downloadUrl,
      };

      let statusCode = 302; // Default redirect

      // Handle Range requests
      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : contentLength - 1;

        if (start >= contentLength || end >= contentLength || start > end) {
          // Invalid range - return 416
          Object.entries({
            ...headers,
            'Content-Range': `bytes */${contentLength}`,
          }).forEach(([key, value]) => {
            if (value !== undefined) {
              res.setHeader(key, value);
            }
          });
          res.status(416);
          res.end();
          return;
        }

        const chunkSize = end - start + 1;
        statusCode = 206; // Partial content
        headers['Content-Range'] = `bytes ${start}-${end}/${contentLength}`;
        headers['Content-Length'] = chunkSize.toString();
      }

      // Apply all headers
      Object.entries(headers).forEach(([key, value]) => {
        if (value !== undefined) {
          res.setHeader(key, value as string);
        }
      });

      // Set status and end response
      res.status(statusCode);
      res.end();
    } catch {
      throw new BadRequestException('Failed to prepare download');
    }
  }

  async prepareDownload(
    userId: string,
    bookId: string,
    range?: string,
  ): Promise<DownloadResponse> {
    const book = await this.findReadyBookByIdAndUser(bookId, userId);

    try {
      // Get object metadata
      const metadata = await this.s3.getObjectMetadata(book.fileStorageKey);
      const contentLength = metadata.ContentLength || 0;

      // Generate presigned URL
      const downloadUrl = await this.s3.generatePresignedDownloadUrl(
        book.fileStorageKey,
      );

      // Prepare headers
      const headers: DownloadHeaders = {
        'Content-Type': book.mime,
        'Accept-Ranges': 'bytes',
        'Content-Disposition': `attachment; filename="${book.title}"`,
        'Content-Length': contentLength.toString(),
        Location: downloadUrl,
      };

      let statusCode = 302; // Default redirect

      // Handle Range requests
      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : contentLength - 1;

        if (start >= contentLength || end >= contentLength || start > end) {
          // Invalid range - return 416
          return {
            headers: {
              ...headers,
              'Content-Range': `bytes */${contentLength}`,
            },
            statusCode: 416,
          };
        }

        const chunkSize = end - start + 1;
        statusCode = 206; // Partial content
        headers['Content-Range'] = `bytes ${start}-${end}/${contentLength}`;
        headers['Content-Length'] = chunkSize.toString();
      }

      return {
        headers,
        statusCode,
      };
    } catch {
      throw new BadRequestException('Failed to prepare download');
    }
  }

  async generateCoverPresignUrl(
    userId: string,
    bookId: string,
    filename: string,
    mime: string,
    sizeBytes: number,
  ): Promise<CoverPresignResponse> {
    // Verify book exists
    await this.findBookByIdAndUser(bookId, userId);

    const { storageKey, presignInfo } = await this.generateCustomCoverPresign(
      userId,
      filename,
      mime,
      sizeBytes,
    );

    return {
      presignUploadInfo: presignInfo,
      storageKey,
    };
  }

  async finalizeCoverUpload(
    userId: string,
    bookId: string,
    storageKey: string,
  ): Promise<{ success: boolean }> {
    const book = await this.findBookByIdAndUser(bookId, userId);

    // Verify new cover exists
    await this.validateFileExists(storageKey, true);

    // Delete old cover if exists
    if (
      book.customCoverStorageKey &&
      typeof book.customCoverStorageKey === 'string'
    ) {
      try {
        await this.s3.deleteCoverObject(book.customCoverStorageKey);
      } catch (error) {
        this.logger.warn(
          `Failed to delete old cover object: ${book.customCoverStorageKey}`,
          error,
        );
      }
    }

    // Update book with new cover
    await this.prisma.book.update({
      where: { id: bookId },
      data: { customCoverStorageKey: storageKey },
    });

    this.logger.log(`Updated cover for book ${bookId}`);

    return { success: true };
  }
}
