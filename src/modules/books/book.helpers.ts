import { Prisma } from '@prisma/client';
import { S3Service } from '@/infrastructure/s3/s3.service';
import { BookResponse } from './book.models';

export const BOOK_WITH_RELATIONS = Prisma.validator<Prisma.BookFindManyArgs>()({
  include: {
    notes: true,
    highlights: true,
    tags: { include: { tag: true } },
  },
});

export type BookWithRelations = Prisma.BookGetPayload<
  typeof BOOK_WITH_RELATIONS
>;

export async function convertBookToResponse(
  book: BookWithRelations,
  s3Service: S3Service,
): Promise<BookResponse> {
  return {
    id: book.id,
    title: book.title,
    author: book.author,
    coverUrl: book.customCoverStorageKey
      ? await s3Service.generatePresignedCoverDownloadUrl(
          book.customCoverStorageKey,
        )
      : undefined,
    fileUrl: await s3Service.generatePresignedDownloadUrl(book.fileStorageKey),
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
