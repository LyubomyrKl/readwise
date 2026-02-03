// Book Request DTOs
export interface UpdateSpentTimeDto {
  bookId: string;
  amount: number;
}

export interface SetBookToFavoriteDto {
  bookId: string;
  isFavorite: boolean;
}

export interface UpdateLastAccessedDto {
  bookId: string;
}

// Book Response Types
export interface BookResponse {
  id: string;
  title: string;
  author: string;
  coverUrl?: string;
  fileUrl: string;
  contentType: string;
  originalFileName: string;
  size: number;
  spentTime: number;
  isFavorite?: boolean;
  isFinished?: boolean;
  lastAccessedAt?: string;
  createdAt: string;
  updatedAt: string;
  userId: string;
  status?: string;
  mime: string;
  pageCount?: number;
  pagePassCount: number;
  description?: string;
  sizeBytes: string;
  highlights: { id: string; content?: string }[];
  summaryKey?: string;
  lastAccessed?: string;
  tags: string[];
  notes: { id: string; body: string; isPinned?: boolean; createdAt: string }[];
}
