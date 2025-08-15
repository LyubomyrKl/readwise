import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import type { Response } from 'express';
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
} from './book.models';

@Injectable()
export class BooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {}

  async createBookAndPresign(
    userId: string,
    dto: CreateBookDto,
  ): Promise<PresignResponse> {
    const temporaryStorageKey = this.s3.generateStorageKey(
      userId,
      dto.filename,
      'temp',
    );

    const book = await this.prisma.book.create({
      data: {
        userId,
        title: dto.title,
        author: dto.author,
        customCoverFilePath: dto.customCoverFilePath,
        description: dto.description,
        mime: dto.mime,
        sizeBytes: BigInt(dto.sizeBytes),

        storageKey: temporaryStorageKey,
        status: 'pending',
      },
    });

    if (!book) {
      throw new BadRequestException('Failed to create book record');
    }

    const presignUploadInfo = await this.s3.generatePresignedUploadUrl(
      temporaryStorageKey,
      dto.mime,
      dto.sizeBytes,
    );

    if (!presignUploadInfo) {
      throw new BadRequestException(
        'Failed to generate presigned URL for cover',
      );
    }

    return {
      bookId: book.id,
      storageKey: temporaryStorageKey,
      presignUploadInfo,
    };
  }

  async finalizeBook(
    userId: string,
    bookId: string,
  ): Promise<FinalizeResponse> {
    // Find the book and ensure it belongs to the user
    const book = await this.prisma.book.findFirst({
      where: {
        id: bookId,
        userId,
        status: 'pending',
      },
    });

    if (!book) {
      throw new NotFoundException('Book not found or already finalized');
    }

    // Verify file exists in storage and get file data
    const exists = await this.s3.objectExists(book.storageKey);

    if (!exists) {
      throw new BadRequestException('File not found in storage');
    }

    // Download file and calculate SHA256 hash
    const fileBuffer = await this.s3.getObjectBuffer(book.storageKey);
    const hash = createHash('sha256');
    hash.update(fileBuffer);
    const sha256 = hash.digest('hex');

    // Generate final storage key with hash (extract filename from temporary key)
    const tempFilename = book.storageKey.split('/').pop()!;
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
    if (finalStorageKey !== book.storageKey) {
      await this.s3.copyObject(book.storageKey, finalStorageKey);
      await this.s3.deleteObject(book.storageKey);
    }

    // Update book with hash and final storage key
    await this.prisma.book.update({
      where: { id: bookId },
      data: {
        sha256,
        storageKey: finalStorageKey,
        status: 'ready',
      },
    });

    return {
      bookId,
      status: 'ready',
    };
  }

  async getAllBooks(userId: string): Promise<BookResponse[]> {
    const books = await this.prisma.book.findMany({
      where: {
        userId,
        status: {
          notIn: ['pending', 'error'],
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    return books.map((book) => ({
      id: book.id,
      title: book.title,
      author: book.author,
      customCoverFilePath: book.customCoverFilePath,
      spentHours: book.spentHours,
      pageCount: book.pageCount || undefined,
      pagePassCount: book.pagePassCount,
      isFinished: book.isFinished,
      isFavorite: book.isFavorite,
      mime: book.mime,
      sizeBytes: book.sizeBytes.toString(),
      status: book.status,
      createdAt: book.createdAt,
      updatedAt: book.updatedAt,
    }));
  }

  async getBook(userId: string, bookId: string): Promise<BookResponse> {
    const book = await this.prisma.book.findFirst({
      where: {
        id: bookId,
        userId,
      },
    });

    if (!book) {
      throw new NotFoundException('Book not found');
    }

    return {
      id: book.id,
      title: book.title,
      author: book.author,
      customCoverFilePath: book.customCoverFilePath,
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

  async downloadBook(
    userId: string,
    bookId: string,
    range: string | undefined,
    res: Response,
  ): Promise<void> {
    const book = await this.prisma.book.findFirst({
      where: {
        id: bookId,
        userId,
        status: 'ready',
      },
    });

    if (!book) {
      throw new NotFoundException('Book not found or not ready for download');
    }

    try {
      // Get object metadata
      const metadata = await this.s3.getObjectMetadata(book.storageKey);
      const contentLength = metadata.ContentLength || 0;

      // Generate presigned URL
      const downloadUrl = await this.s3.generatePresignedDownloadUrl(
        book.storageKey,
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
    const book = await this.prisma.book.findFirst({
      where: {
        id: bookId,
        userId,
        status: 'ready',
      },
    });

    if (!book) {
      throw new NotFoundException('Book not found or not ready for download');
    }

    try {
      // Get object metadata
      const metadata = await this.s3.getObjectMetadata(book.storageKey);
      const contentLength = metadata.ContentLength || 0;

      // Generate presigned URL
      const downloadUrl = await this.s3.generatePresignedDownloadUrl(
        book.storageKey,
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
    filename: string,
    mime: string,
    sizeBytes: number,
  ): Promise<CoverPresignResponse> {
    const storageKey = this.s3.generateCoverStorageKey(userId, filename);

    const presignUploadInfo = await this.s3.generatePresignedCoverUploadUrl(
      storageKey,
      mime,
      sizeBytes,
    );

    if (!presignUploadInfo) {
      throw new BadRequestException(
        'Failed to generate presigned URL for cover',
      );
    }

    return {
      presignUploadInfo,
      storageKey,
    };
  }

  async finalizeCoverUpload(
    userId: string,
    bookId: string,
    storageKey: string,
  ): Promise<{ success: boolean }> {
    // Verify book exists and belongs to user
    const book = await this.prisma.book.findFirst({
      where: {
        id: bookId,
        userId,
      },
    });

    if (!book) {
      throw new NotFoundException('Book not found');
    }

    // Verify file exists in storage
    const exists = await this.s3.coverObjectExists(storageKey);
    if (!exists) {
      throw new BadRequestException('Cover file not found in storage');
    }

    // Delete old cover if exists
    if (
      book.customCoverFilePath &&
      typeof book.customCoverFilePath === 'string'
    ) {
      try {
        await this.s3.deleteCoverObject(book.customCoverFilePath);
      } catch {
        // Ignore errors when deleting old cover
      }
    }

    // Update book with new cover
    await this.prisma.book.update({
      where: { id: bookId },
      data: { customCoverFilePath: storageKey },
    });

    return { success: true };
  }
}
