import { Prisma } from '@prisma/client';
import { BookResponse, StoredReadingPosition } from './document.models';

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
  // as stored: Locator v2, or the v1 shape the readers upgrade on the next save
  const stored = book.readingPosition;
  const position = stored && typeof stored === 'object' && !Array.isArray(stored) ? (stored as StoredReadingPosition) : null;
  const readingPosition =
    position && ((position.v === 2 && (position.format === 'pdf' || position.format === 'epub')) || position.type === 'pdf' || position.type === 'epub')
      ? position
      : null;

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
    hasStructure: !!book.irStorageKey,
    language: book.language ?? null,
    noteCount: book._count.notes,
    highlightCount: book._count.highlights,
    readingPosition,
    createdAt: book.createdAt,
    updatedAt: book.updatedAt,
  };
}

/**
 * The pages behind a reading position, for the library's "12/240 pages" and time left: the page
 * itself in a PDF (0-based in the locator), the share of the book in a reflowable one. Undefined
 * (the count stays) when the book has no page count or the position says neither.
 */
export function pagesRead(position: { page?: number; totalProgression?: number }, pageCount: number): number | undefined {
  if (!(pageCount > 0)) return undefined;
  const pages =
    position.page !== undefined
      ? position.page + 1
      : position.totalProgression !== undefined
        ? Math.round(position.totalProgression * pageCount)
        : undefined;
  return pages === undefined ? undefined : Math.min(Math.max(pages, 0), pageCount);
}
