/**
 * The reader's typed API. Every function is one API endpoint behind the proxy;
 * adding an endpoint means a controller method in apps/api and a line here.
 */
import { apiFetch, apiUrl } from "@platform/api/http";
import type {
  BookResponse,
  CreateHighlightDto,
  CreateNoteDto,
  CreateSummaryDto,
  CreateSummaryResponse,
  HighlightResponse,
  NoteResponse,
  ReadingPosition,
  SummaryContentResponse,
  SummaryResponse,
  UpdateHighlightDto,
  UpdateNoteDto,
} from "./types";

type Ok = { status: string };

const enc = encodeURIComponent;

/** The API returns API-relative file paths; the browser needs them behind the proxy. */
export function withBrowserUrls(book: BookResponse): BookResponse {
  return {
    ...book,
    fileUrl: apiUrl(book.fileUrl),
    coverUrl: book.coverUrl ? apiUrl(book.coverUrl) : undefined,
  };
}

export const readerApi = {
  documents: {
    /** where the upload widget posts its multipart form */
    uploadUrl: apiUrl("/reader/documents/upload"),

    list: async () => (await apiFetch<BookResponse[]>("/reader/documents")).map(withBrowserUrls),
    get: async (id: string) => withBrowserUrls(await apiFetch<BookResponse>(`/reader/documents/${enc(id)}`)),
    delete: (id: string) => apiFetch<Ok>(`/reader/documents/${enc(id)}`, { method: "DELETE" }),
    setFavorite: (bookId: string, isFavorite: boolean, signal?: AbortSignal) =>
      apiFetch<Ok>("/reader/documents/favorite", { method: "POST", json: { bookId, isFavorite }, signal }),
    setLastAccessed: (bookId: string) =>
      apiFetch<{ bookId: string }>("/reader/documents/last-accessed", { method: "POST", json: { bookId } }),
    addSpentTime: (bookId: string, amount: number) =>
      apiFetch<Ok>("/reader/documents/time-spent", { method: "POST", json: { bookId, amount } }),
    setReadingPosition: (bookId: string, position: ReadingPosition) =>
      apiFetch<Ok>("/reader/documents/reading-position", { method: "POST", json: { bookId, position } }),
  },

  reading: {
    listHighlights: (bookId: string) => apiFetch<HighlightResponse[]>(`/reader/documents/${enc(bookId)}/highlights`),
    createHighlight: (bookId: string, dto: CreateHighlightDto) =>
      apiFetch<HighlightResponse>(`/reader/documents/${enc(bookId)}/highlights`, { method: "POST", json: dto }),
    updateHighlight: (id: string, dto: UpdateHighlightDto) =>
      apiFetch<HighlightResponse>(`/reader/highlights/${enc(id)}`, { method: "PATCH", json: dto }),
    deleteHighlight: (id: string) => apiFetch<Ok>(`/reader/highlights/${enc(id)}`, { method: "DELETE" }),

    listNotes: (bookId: string) => apiFetch<NoteResponse[]>(`/reader/documents/${enc(bookId)}/notes`),
    createNote: (bookId: string, dto: CreateNoteDto) =>
      apiFetch<NoteResponse>(`/reader/documents/${enc(bookId)}/notes`, { method: "POST", json: dto }),
    updateNote: (id: string, dto: UpdateNoteDto) =>
      apiFetch<NoteResponse>(`/reader/notes/${enc(id)}`, { method: "PATCH", json: dto }),
    deleteNote: (id: string) => apiFetch<Ok>(`/reader/notes/${enc(id)}`, { method: "DELETE" }),
  },

  summaries: {
    create: (bookId: string, dto: CreateSummaryDto) =>
      apiFetch<CreateSummaryResponse>(`/reader/documents/${enc(bookId)}/summaries`, { method: "POST", json: dto }),
    listForBook: (bookId: string) => apiFetch<SummaryResponse[]>(`/reader/documents/${enc(bookId)}/summaries`),
    /** every summary of the user; latestPerBook keeps only the newest of each document */
    listAll: (opts: { latestPerBook?: boolean; limit?: number } = {}) =>
      apiFetch<SummaryResponse[]>("/reader/summaries", { query: opts }),
    get: (summaryId: string) => apiFetch<SummaryResponse>(`/reader/summaries/${enc(summaryId)}`),
    content: (summaryId: string) => apiFetch<SummaryContentResponse>(`/reader/summaries/${enc(summaryId)}/content`),
  },
};
