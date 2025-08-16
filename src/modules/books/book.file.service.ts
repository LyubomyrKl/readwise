import { Injectable, BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { Book } from '@prisma/client';
import { S3Service } from '@/infrastructure/s3/s3.service';
import { BOOK_ERROR_MESSAGES } from './book.constants';

@Injectable()
export class BookFileService {
  constructor(private readonly s3: S3Service) {}

  async processBookFile(
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
    );

    // Move file to final location if different
    if (finalStorageKey !== book.fileStorageKey) {
      await this.s3.copyObject(book.fileStorageKey, finalStorageKey);
      await this.s3.deleteObject(book.fileStorageKey);
    }

    return { sha256, finalStorageKey };
  }

  async processCoverFile(
    book: Book,
    userId: string,
  ): Promise<{ finalCoverStorageKey: string }> {
    if (!book.customCoverStorageKey) {
      throw new BadRequestException(BOOK_ERROR_MESSAGES.COVER_NOT_FOUND);
    }

    // Extract original filename from temporary key
    const tempFilename = book.customCoverStorageKey.split('/').pop()!;
    const originalFilename = tempFilename.substring(
      0,
      tempFilename.lastIndexOf('-'),
    );

    const finalCoverStorageKey = this.s3.generateCoverStorageKey(
      userId,
      originalFilename,
    );

    // Move cover to final location if different
    if (finalCoverStorageKey !== book.customCoverStorageKey) {
      await this.s3.copyCoverObject(
        book.customCoverStorageKey,
        finalCoverStorageKey,
      );
      await this.s3.deleteCoverObject(book.customCoverStorageKey);
    }

    return { finalCoverStorageKey };
  }
}
