import type { BookResponse } from "@/lib/types";

// Re-export types from centralized location
export type {
  UpdateSpentTimeDto as UpdateSpentTimeReqType,
  BookResponse,
} from "@/lib/types";

export function transformBookUrls(book: BookResponse): BookResponse {
  return {
    ...book,
    coverUrl: book.coverUrl ? `/api${book.coverUrl}` : undefined,
    fileUrl: `/api${book.fileUrl}`,
  };
}
