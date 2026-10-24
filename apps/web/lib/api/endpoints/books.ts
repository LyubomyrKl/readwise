import { getClient, withRefresh } from "../client";
import type {
  UpdateSpentTimeDto,
  SetBookToFavoriteDto,
  UpdateLastAccessedDto,
  BookResponse,
  UpdateReadingPositionDto,
  CreateHighlightDto,
  UpdateHighlightDto,
  HighlightResponse,
  CreateNoteDto,
  UpdateNoteDto,
  NoteResponse,
} from "@/lib/types";

export const booksApi = {
  async getAllBooks() {
    return withRefresh(() => {
      const client = getClient();
      return client.get<BookResponse[]>("/books");
    });
  },

  async getBook(id: string) {
    return withRefresh(() => {
      const client = getClient();
      return client.get<BookResponse>(`/books/${id}`);
    });
  },

  async downloadBook(id: string) {
    return withRefresh(() => {
      const client = getClient();
      return client.get(`/books/${id}/download`, {
        responseType: "arraybuffer",
      });
    });
  },

  async downloadCover(id: string) {
    return withRefresh(() => {
      const client = getClient();
      return client.get(`/books/${id}/cover`, {
        responseType: "arraybuffer",
      });
    });
  },

  async updateTimeSpent(dto: UpdateSpentTimeDto) {
    return withRefresh(() => {
      const client = getClient();
      return client.post("/books/time-spent", dto);
    });
  },

  async setBookToFavorite(dto: SetBookToFavoriteDto) {
    return withRefresh(() => {
      const client = getClient();
      return client.post("/books/favorite", dto);
    });
  },

  async setLastAccessed(dto: UpdateLastAccessedDto) {
    return withRefresh(() => {
      const client = getClient();
      return client.post("/books/last-accessed", dto);
    });
  },

  async deleteBook(id: string) {
    return withRefresh(() => {
      const client = getClient();
      return client.delete(`/books/${id}`);
    });
  },

  // Reading Position
  async updateReadingPosition(dto: UpdateReadingPositionDto) {
    return withRefresh(() => {
      const client = getClient();
      return client.post("/books/reading-position", dto);
    });
  },

  // Highlights
  async getHighlights(bookId: string) {
    return withRefresh(() => {
      const client = getClient();
      return client.get<HighlightResponse[]>(`/books/${bookId}/highlights`);
    });
  },

  async createHighlight(bookId: string, dto: CreateHighlightDto) {
    return withRefresh(() => {
      const client = getClient();
      return client.post<HighlightResponse>(`/books/${bookId}/highlights`, dto);
    });
  },

  async updateHighlight(highlightId: string, dto: UpdateHighlightDto) {
    return withRefresh(() => {
      const client = getClient();
      return client.patch<HighlightResponse>(`/highlights/${highlightId}`, dto);
    });
  },

  async deleteHighlight(highlightId: string) {
    return withRefresh(() => {
      const client = getClient();
      return client.delete(`/highlights/${highlightId}`);
    });
  },

  // Notes
  async getNotes(bookId: string) {
    return withRefresh(() => {
      const client = getClient();
      return client.get<NoteResponse[]>(`/books/${bookId}/notes`);
    });
  },

  async createNote(bookId: string, dto: CreateNoteDto) {
    return withRefresh(() => {
      const client = getClient();
      return client.post<NoteResponse>(`/books/${bookId}/notes`, dto);
    });
  },

  async updateNote(noteId: string, dto: UpdateNoteDto) {
    return withRefresh(() => {
      const client = getClient();
      return client.patch<NoteResponse>(`/notes/${noteId}`, dto);
    });
  },

  async deleteNote(noteId: string) {
    return withRefresh(() => {
      const client = getClient();
      return client.delete(`/notes/${noteId}`);
    });
  },
};
