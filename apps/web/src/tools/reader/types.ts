/**
 * Reader types, mirroring the API's DTOs (apps/api/src/tools/reader/**).
 * Hand-written on purpose: the OpenAPI document exists, but the decorated DTOs
 * generate noisier types than these few interfaces.
 */
import type { JobResponse } from "@platform/jobs/types";
import type { Summary } from "./summaries/types";

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

export interface ReadingPosition {
  type: "pdf" | "epub";
  page?: number;
  cfi?: string;
  percentage?: number;
}

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
  hasExtraction: boolean;
  noteCount: number;
  highlightCount: number;
  readingPosition?: ReadingPosition | null;
  createdAt: string;
  updatedAt: string;
}

export type IBook = BookResponse;

export interface UploadResponse {
  bookId: string;
  status: string;
}

// ---- reading ----------------------------------------------------------------------------

export interface HighlightAnchor {
  type: "pdf" | "epub";
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

export interface NoteAnchor {
  type: "pdf" | "epub";
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

// ---- summaries --------------------------------------------------------------------------

export type SummaryType = "extractive" | "abstractive";

export const SUMMARY_TYPES: { value: SummaryType; label: string; description: string }[] = [
  { value: "extractive", label: "Extractive", description: "Extracts key sentences directly from the text" },
  { value: "abstractive", label: "Abstractive", description: "Generates new text that paraphrases the content" },
];

export type SummarizationStrategy = "basic" | "structured" | "two_pass" | "chain_of_density" | "hybrid";

export const SUMMARIZATION_STRATEGIES: { value: SummarizationStrategy; label: string; description: string }[] = [
  { value: "basic", label: "Basic", description: "Simple and fast summarization" },
  { value: "structured", label: "Structured", description: "Better prompts with strict constraints (recommended)" },
  { value: "two_pass", label: "Two-Pass", description: "Extracts key info, then synthesizes (best factuality)" },
  { value: "chain_of_density", label: "Chain of Density", description: "Progressive density increase (most information-dense)" },
  { value: "hybrid", label: "Hybrid", description: "Extractive then abstractive (best for technical content)" },
];

/** Only these strategies support the extractive mode. */
export const STRATEGIES_WITH_EXTRACTIVE: readonly SummarizationStrategy[] = ["basic", "structured"];

export type SummaryState = "queued" | "running" | "waiting" | "ready" | "failed" | "cancelled";

export interface CreateSummaryDto {
  summaryType?: SummaryType;
  summarizationStrategy?: SummarizationStrategy;
}

export interface CreateSummaryResponse {
  summaryId: string;
  jobId: string;
  extractJobId?: string | null;
  existing: boolean;
  storageKey?: string | null;
}

export interface SummaryResponse {
  id: string;
  bookId: string;
  type: SummaryType;
  strategy: SummarizationStrategy;
  percent: number;
  storageKey?: string | null;
  jobId?: string | null;
  state: SummaryState;
  job?: JobResponse | null;
  createdAt: string;
}

export interface SummaryContentResponse extends SummaryResponse {
  summary: Summary;
}
