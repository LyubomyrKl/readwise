import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
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
    const storageKey = this.s3.generateStorageKey(
      userId,
      dto.filename,
      dto.sha256,
    );

    // Create book record with pending status
    const book = await this.prisma.book.create({
      data: {
        userId,
        title: dto.title,
        author: dto.author,
        cover: dto.cover,
        pageCount: dto.pageCount,
        mime: dto.mime,
        sizeBytes: BigInt(dto.sizeBytes),
        sha256: dto.sha256,
        storageKey,
        status: 'pending',
      },
    });

    // Generate presigned URL for upload
    const upload = await this.s3.generatePresignedUploadUrl(
      storageKey,
      dto.mime,
      dto.sizeBytes,
    );

    return {
      bookId: book.id,
      storageKey,
      upload,
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

    // Verify file exists in storage
    const exists = await this.s3.objectExists(book.storageKey);
    if (!exists) {
      throw new BadRequestException('File not found in storage');
    }

    // Update book status to ready
    await this.prisma.book.update({
      where: { id: bookId },
      data: { status: 'ready' },
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

    return books.map(book => ({
      id: book.id,
      title: book.title,
      author: book.author,
      cover: book.cover || undefined,
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
      cover: book.cover || undefined,
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
}
