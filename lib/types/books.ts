// Book Request DTOs
export interface CreateBookDto {
  title: string;
  author?: string;
  description?: string;
  filename: string;
  mime: string;
  sizeBytes: number;
  pageCount?: number;
  customCoverFilename?: string;
  customCoverMime?: string;
}

export interface FinalizeBookDto {
  bookId: string;
  storageKey?: string;
}

export interface FinalizeCoverDto {
  bookId: string;
  storageKey?: string;
}

export interface PresignedUploadDto {
  filename: string;
  mime: string;
  size?: number;
}

export interface CoverUpdateDto {
  bookId: string;
  storageKey: string;
}

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
export interface PresignUploadInfo {
  url: string;
  headers: Record<string, string>;
}

export interface PresignResponse {
  bookId: string;
  storageKey: string;
  presignUploadInfo: PresignUploadInfo;
  customCoverStorageKey?: string;
  customCoverPresignInfo?: PresignUploadInfo;
}

export interface FinalizeResponse {
  bookId: string;
  status: string;
}

export interface CoverPresignResponse {
  storageKey: string;
  presignUploadInfo: PresignUploadInfo;
}

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

// Transformed types for frontend consumption
export interface TransformedPresignRes {
  bookId: string;
  storageKey: string;
  upload: {
    url: string;
    headers: Record<string, string>;
  };
  coverStorageKey?: string;
  coverUpload?: {
    url: string;
    headers: Record<string, string>;
  };
}

export interface TransformedCoverPresignRes {
  storageKey: string;
  upload: {
    url: string;
    headers: Record<string, string>;
  };
}
