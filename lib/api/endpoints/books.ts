import { getClient, withRefresh } from "../client";
import type {
  CreateBookDto,
  FinalizeBookDto,
  FinalizeCoverDto,
  PresignedUploadDto,
  CoverUpdateDto,
  UpdateSpentTimeDto,
  SetBookToFavoriteDto,
  UpdateLastAccessedDto,
  BookResponse,
  PresignResponse,
  FinalizeResponse,
  CoverPresignResponse,
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

  async createBookAndPresign(dto: CreateBookDto) {
    return withRefresh(() => {
      const client = getClient();
      return client.post<PresignResponse>("/books/presign", dto);
    });
  },

  async finalizeBook(dto: FinalizeBookDto) {
    return withRefresh(() => {
      const client = getClient();
      return client.post<FinalizeResponse>("/books/finalize", dto);
    });
  },

  async finalizeCover(dto: FinalizeCoverDto) {
    return withRefresh(() => {
      const client = getClient();
      return client.post<FinalizeResponse>("/books/finalize-cover", dto);
    });
  },

  async coverPresign(dto: PresignedUploadDto) {
    return withRefresh(() => {
      const client = getClient();
      return client.post<CoverPresignResponse>("/books/cover-presign", dto);
    });
  },

  async updateCoverFinalize(dto: CoverUpdateDto) {
    return withRefresh(() => {
      const client = getClient();
      return client.post<FinalizeResponse>("/books/update-cover", dto);
    });
  },

  async updateTimeSpent(dto: UpdateSpentTimeDto) {
    return withRefresh(() => {
      const client = getClient();
      return client.post("/books/spent-time", dto);
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
};
