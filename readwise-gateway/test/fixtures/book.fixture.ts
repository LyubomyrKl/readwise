import type { BookWithRelations } from '@/modules/books/book.helpers';

/** A fully populated book row as returned with BOOK_WITH_RELATIONS. */
export function makeBook(
  overrides: Partial<BookWithRelations> = {},
): BookWithRelations {
  return {
    id: 'book-1',
    userId: 'user-1',
    title: 'A Book',
    author: 'An Author',
    description: null,
    customCoverStorageKey: null,
    spentTime: 0,
    pageCount: 10,
    pagePassCount: 0,
    isFinished: false,
    isFavorite: false,
    mime: 'application/pdf',
    sizeBytes: BigInt(1234),
    sha256: null,
    fileStorageKey: 'user-1-1-a-book.pdf',
    status: 'ready',
    errorMessage: null,
    summaryStorageKey: null,
    extractionStorageKey: null,
    summaryType: null,
    summarizationStrategy: null,
    lastAccessed: new Date('2026-01-01T00:00:00Z'),
    readingPosition: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    notes: [],
    highlights: [],
    ...overrides,
  };
}
