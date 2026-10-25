import { Prisma } from '@prisma/client';
import { BookResponse, ReadingPositionResponse } from './document.models';

/** A book row plus the counts the library shows; relations themselves stay in `reading`. */
export const BOOK_WITH_COUNTS = Prisma.validator<Prisma.BookDefaultArgs>()({
  include: {
    _count: {
      select: {
        notes: { where: { deletedAt: null } },
        highlights: { where: { deletedAt: null } },
      },
    },
  },
});

export type BookRow = Prisma.BookGetPayload<typeof BOOK_WITH_COUNTS>;

/**
 * Fields that no longer live on the book row but that the current web client
 * still reads from it. Supplied by the summaries sub-module (Phase 5 removes them).
 */
export interface BookCompatState {
  summaryKey?: string | null;
  status?: string;
  errorMessage?: string | null;
}

export function convertBookToResponse(
  book: BookRow,
  compat: BookCompatState = {},
): BookResponse {
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
    coverUrl: book.customCoverStorageKey ? `/books/${book.id}/cover` : undefined,
    fileUrl: `/books/${book.id}/download`,
    description: book.description,
    spentTime: book.spentTime,
    pageCount: book.pageCount,
    pagePassCount: book.pagePassCount,
    summaryKey: compat.summaryKey ?? null,
    lastAccessed: book.lastAccessed,
    isFinished: book.isFinished,
    isFavorite: book.isFavorite,
    mime: book.mime,
    sizeBytes: book.sizeBytes.toString(),
    status: compat.status ?? book.status,
    errorMessage: compat.errorMessage ?? book.errorMessage ?? null,
    noteCount: book._count.notes,
    highlightCount: book._count.highlights,
    readingPosition,
    createdAt: book.createdAt,
    updatedAt: book.updatedAt,
  };
}
