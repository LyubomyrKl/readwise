import { getClient, withRefresh } from "../client";
import type {
  CreateDictionaryEntryDto,
  UpdateDictionaryEntryDto,
  CreateCollocationDto,
  DictionarySearchQuery,
  DictionaryEntryResponse,
  DictionaryStatsResponse,
  DictionarySearchResult,
  CollocationResponse,
  LearningNoteResponse,
} from "@/lib/types";

export const dictionaryApi = {
  // Entries
  async getEntries(query?: DictionarySearchQuery) {
    return withRefresh(() => {
      const client = getClient();
      const params = new URLSearchParams();
      if (query?.q) params.set("q", query.q);
      if (query?.masteryLevel !== undefined) params.set("masteryLevel", String(query.masteryLevel));
      if (query?.tag) params.set("tag", query.tag);
      if (query?.sortBy) params.set("sortBy", query.sortBy);
      if (query?.sortOrder) params.set("sortOrder", query.sortOrder);
      if (query?.skip !== undefined) params.set("skip", String(query.skip));
      if (query?.take !== undefined) params.set("take", String(query.take));
      const queryString = params.toString();
      return client.get<DictionaryEntryResponse[]>(
        `/dictionary/entries${queryString ? `?${queryString}` : ""}`
      );
    });
  },

  async getEntry(id: string) {
    return withRefresh(() => {
      const client = getClient();
      return client.get<DictionaryEntryResponse>(`/dictionary/entries/${id}`);
    });
  },

  async createEntry(dto: CreateDictionaryEntryDto) {
    return withRefresh(() => {
      const client = getClient();
      return client.post<DictionaryEntryResponse>("/dictionary/entries", dto);
    });
  },

  async updateEntry(id: string, dto: UpdateDictionaryEntryDto) {
    return withRefresh(() => {
      const client = getClient();
      return client.patch<DictionaryEntryResponse>(`/dictionary/entries/${id}`, dto);
    });
  },

  async deleteEntry(id: string) {
    return withRefresh(() => {
      const client = getClient();
      return client.delete(`/dictionary/entries/${id}`);
    });
  },

  // Collocations
  async addCollocation(entryId: string, dto: CreateCollocationDto) {
    return withRefresh(() => {
      const client = getClient();
      return client.post<CollocationResponse>(
        `/dictionary/entries/${entryId}/collocations`,
        dto
      );
    });
  },

  async removeCollocation(entryId: string, collocationId: string) {
    return withRefresh(() => {
      const client = getClient();
      return client.delete(
        `/dictionary/entries/${entryId}/collocations/${collocationId}`
      );
    });
  },

  // Card generation
  async createCards(entryId: string) {
    return withRefresh(() => {
      const client = getClient();
      return client.post<LearningNoteResponse>(
        `/dictionary/entries/${entryId}/create-cards`,
        {}
      );
    });
  },

  // Stats
  async getStats() {
    return withRefresh(() => {
      const client = getClient();
      return client.get<DictionaryStatsResponse>("/dictionary/stats");
    });
  },

  // Search
  async search(query: string) {
    return withRefresh(() => {
      const client = getClient();
      return client.get<DictionarySearchResult[]>(
        `/dictionary/search?q=${encodeURIComponent(query)}`
      );
    });
  },
};
