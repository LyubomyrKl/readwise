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

// Reading Position Types
export interface ReadingPosition {
  type: 'pdf' | 'epub';
  page?: number;
  cfi?: string;
  percentage?: number;
}

export interface UpdateReadingPositionDto {
  bookId: string;
  position: ReadingPosition;
}

// Highlight Types
export interface HighlightAnchor {
  type: 'pdf' | 'epub';
  page?: number;
  cfi?: string;
  rects?: Array<{ x: number; y: number; width: number; height: number }>;
}

export interface CreateHighlightDto {
  text: string;
  anchor: HighlightAnchor;
  color?: string;
  noteId?: string;
}

export interface UpdateHighlightDto {
  color?: string;
  noteId?: string | null;
}

export interface HighlightResponse {
  id: string;
  userId: string;
  bookId: string;
  color?: string | null;
  text: string;
  anchor: HighlightAnchor;
  noteId?: string | null;
  createdAt: string;
  updatedAt: string;
}

// Note Types
export interface NoteAnchor {
  type: 'pdf' | 'epub';
  page?: number;
  cfi?: string;
}

export interface CreateNoteDto {
  body: string;
  anchor?: NoteAnchor;
  isPinned?: boolean;
}

export interface UpdateNoteDto {
  body?: string;
  isPinned?: boolean;
  isArchived?: boolean;
}

export interface NoteResponse {
  id: string;
  userId: string;
  bookId: string;
  body: string;
  anchor?: NoteAnchor | null;
  isPinned: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
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
  /** Last processing error, present when status is "error". */
  errorMessage?: string | null;
  mime: string;
  pageCount?: number;
  pagePassCount: number;
  description?: string;
  sizeBytes: string;
  highlights: HighlightResponse[];
  summaryKey?: string;
  lastAccessed?: string;
  notes: NoteResponse[];
  readingPosition?: ReadingPosition | null;
}
