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

export function convertBookToResponse(book: BookRow): BookResponse {
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
    // API-relative; the web client prefixes its proxy path
    coverUrl: book.customCoverStorageKey ? `/reader/documents/${book.id}/cover` : undefined,
    fileUrl: `/reader/documents/${book.id}/download`,
    description: book.description,
    spentTime: book.spentTime,
    pageCount: book.pageCount,
    pagePassCount: book.pagePassCount,
    lastAccessed: book.lastAccessed,
    isFinished: book.isFinished,
    isFavorite: book.isFavorite,
    mime: book.mime,
    sizeBytes: book.sizeBytes.toString(),
    status: book.status,
    errorMessage: book.errorMessage ?? null,
    hasExtraction: !!book.extractionStorageKey,
    noteCount: book._count.notes,
    highlightCount: book._count.highlights,
    readingPosition,
    createdAt: book.createdAt,
    updatedAt: book.updatedAt,
  };
}
