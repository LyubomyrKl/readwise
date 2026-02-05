import { Prisma } from '@prisma/client';
import { BookResponse, ReadingPositionResponse } from './book.models';

export const BOOK_WITH_RELATIONS = Prisma.validator<Prisma.BookFindManyArgs>()({
  include: {
    notes: {
      where: { deletedAt: null },
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
    },
    highlights: {
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
    },
    tags: { include: { tag: true } },
  },
});

export type BookWithRelations = Prisma.BookGetPayload<
  typeof BOOK_WITH_RELATIONS
>;

export function convertBookToResponse(book: BookWithRelations): BookResponse {
  // Parse reading position from JSON
  let readingPosition: ReadingPositionResponse | null = null;
  if (book.readingPosition && typeof book.readingPosition === 'object') {
    const pos = book.readingPosition as Record<string, unknown>;
    if (pos.type === 'pdf' || pos.type === 'epub') {
      readingPosition = {
        type: pos.type,
        page: typeof pos.page === 'number' ? pos.page : undefined,
        cfi: typeof pos.cfi === 'string' ? pos.cfi : undefined,
        percentage: typeof pos.percentage === 'number' ? pos.percentage : undefined,
      };
    }
  }

  return {
    id: book.id,
    title: book.title,
    author: book.author,
    coverUrl: book.customCoverStorageKey
      ? `/books/${book.id}/cover`
      : undefined,
    fileUrl: `/books/${book.id}/download`,
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
    readingPosition,
    createdAt: book.createdAt,
    updatedAt: book.updatedAt,
  };
}
