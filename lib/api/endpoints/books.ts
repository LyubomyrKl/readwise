import { getClient, withRefresh } from "../client";
import type {
  UpdateSpentTimeDto,
  SetBookToFavoriteDto,
  UpdateLastAccessedDto,
  BookResponse,
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
};
