/**
 * Reader types, mirroring the API's DTOs (apps/api/src/tools/reader/**).
 * Hand-written on purpose: the OpenAPI document exists, but the decorated DTOs
 * generate noisier types than these few interfaces.
 */
import type { JobResponse } from "@platform/jobs/types";
import type { LegacyAnchor, Locator } from "./reading/locator";

// ---- documents --------------------------------------------------------------------------

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

/** Where the reader is (Locator v2; the readers upgrade a v1 position on its next save). */
export type ReadingPosition = Locator;

export interface UpdateReadingPositionDto {
  bookId: string;
  position: ReadingPosition;
}

export interface BookResponse {
  id: string;
  title: string;
  author: string;
  description?: string | null;
  /** browser URL of the cover (already prefixed with the proxy path) */
  coverUrl?: string;
  /** browser URL of the file (already prefixed with the proxy path) */
  fileUrl: string;
  spentTime: number;
  pageCount?: number;
  pagePassCount: number;
  isFinished: boolean;
  isFavorite: boolean;
  lastAccessed?: string | null;
  mime: string;
  sizeBytes: string;
  /** state of the file itself */
  status: "ready" | "error";
  errorMessage?: string | null;
  /** the structure (contents, pictures, language) was read on upload */
  hasStructure?: boolean;
  /** "en", "ru", "uk" or "other" */
  language?: string | null;
  noteCount: number;
  highlightCount: number;
  readingPosition?: Locator | LegacyAnchor | null;
  createdAt: string;
  updatedAt: string;
}

export type IBook = BookResponse;

export interface UploadResponse {
  bookId: string;
  status: string;
}

// ---- reading ----------------------------------------------------------------------------

/** A highlight's place: Locator v2 (highlights made before it keep their v1 shape until upgraded). */
export type HighlightAnchor = Locator;

export interface CreateHighlightDto {
  text: string;
  anchor: Locator;
  color?: string;
  noteId?: string;
}

export interface UpdateHighlightDto {
  color?: string;
  noteId?: string | null;
  /** refreshed place, when the reader found the text again by its quote */
  anchor?: Locator;
}

export interface HighlightResponse {
  id: string;
  userId: string;
  bookId: string;
  color?: string | null;
  text: string;
  anchor: Locator | LegacyAnchor;
  noteId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type NoteAnchor = Locator;

export interface CreateNoteDto {
  body: string;
  anchor?: Locator;
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
  anchor?: Locator | LegacyAnchor | null;
  isPinned: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

// ---- abridged editions -------------------------------------------------------------------

export type EditionLength = "short" | "standard" | "long";
export type EditionFigures = "key" | "all" | "none";
export type EditionState = "queued" | "running" | "waiting" | "ready" | "failed" | "cancelled";

export const EDITION_LENGTHS: { value: EditionLength; label: string; description: string }[] = [
  { value: "short", label: "Shorter", description: "about 12–38% of each part" },
  { value: "standard", label: "Standard", description: "about 15–50%, by how dense each part is" },
  { value: "long", label: "Longer", description: "about 20–55% of each part" },
];

export const EDITION_FIGURES: { value: EditionFigures; label: string; description: string }[] = [
  { value: "key", label: "Key pictures", description: "captioned, referred to or large" },
  { value: "all", label: "All pictures", description: "every picture that is not decoration" },
  { value: "none", label: "No pictures", description: "text only" },
];

export interface CreateEditionDto {
  length?: EditionLength;
  figures?: EditionFigures;
}

export interface CreateEditionResponse {
  editionId: string;
  jobId: string;
  existing: boolean;
  editionBookId?: string | null;
}

/** What the reader.abridge job reports; every field is optional to the UI. */
export interface EditionResult {
  ratio?: number;
  chapters?: number;
  sourceWords?: number;
  editionWords?: number;
  pictures?: number;
  checkedParts?: number;
  fixedSentences?: number;
  warnings?: string[];
  metrics?: { seconds?: number };
}

export interface EditionResponse {
  id: string;
  bookId: string;
  length: EditionLength;
  figures: EditionFigures;
  state: EditionState;
  jobId?: string | null;
  job?: JobResponse | null;
  editionBookId?: string | null;
  result?: EditionResult | null;
  createdAt: string;
}

/** What reader.ingest read from the file (GET /reader/documents/:id/structure). */
export interface StructureSection {
  id: string;
  title: string;
  level: number;
  /** chapter, part, front, appendix, or front/back matter the edition leaves out (toc, notes, index...) */
  kind: string;
  words: number;
  figures: number;
  included: boolean;
  /** PDF: the section's first page (1-based) and its printed label (structures read since readers v2) */
  page?: number;
  pageLabel?: string;
  /** EPUB: the document the section starts in */
  href?: string;
}

export interface DocumentStructure {
  language: string;
  words: number;
  structureSource: string;
  informativeFigures?: number;
  ocrPages?: number;
  sections: StructureSection[];
}

export type ChapterState = "pending" | "written" | "checked" | "fixed";

export interface EditionChapterProgress {
  id: string;
  title: string;
  level: number;
  /** a part title without text of its own */
  divider: boolean;
  words: number;
  state: ChapterState;
}

/** GET /reader/editions/:id/progress: the chapters as the worker's manifest has them. */
export interface EditionProgressResponse {
  editionId: string;
  state: EditionState;
  job?: JobResponse | null;
  chapters: EditionChapterProgress[];
  totalWords: number;
  writtenWords: number;
  overview: boolean;
  /** all, dense or off; null until the worker has planned the chapters */
  factcheck?: string | null;
}
