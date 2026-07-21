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
  CreateSemanticGroupDto,
  UpdateSemanticGroupDto,
  SemanticGroupResponse,
  WordWithRelatedResponse,
  CreateSynonymGroupDto,
  UpdateSynonymGroupDto,
  SynonymGroupResponse,
  SynonymGroupSummaryResponse,
  SynonymEntryResponse,
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

  // Semantic Groups
  async getGroups() {
    return withRefresh(() => {
      const client = getClient();
      return client.get<SemanticGroupResponse[]>("/dictionary/groups");
    });
  },

  async createGroup(dto: CreateSemanticGroupDto) {
    return withRefresh(() => {
      const client = getClient();
      return client.post<SemanticGroupResponse>("/dictionary/groups", dto);
    });
  },

  async updateGroup(id: string, dto: UpdateSemanticGroupDto) {
    return withRefresh(() => {
      const client = getClient();
      return client.patch<SemanticGroupResponse>(`/dictionary/groups/${id}`, dto);
    });
  },

  async deleteGroup(id: string) {
    return withRefresh(() => {
      const client = getClient();
      return client.delete(`/dictionary/groups/${id}`);
    });
  },

  async getGroupEntries(groupId: string) {
    return withRefresh(() => {
      const client = getClient();
      return client.get<DictionarySearchResult[]>(`/dictionary/groups/${groupId}/entries`);
    });
  },

  // Entry-Group Management
  async addEntryToGroups(entryId: string, groupIds: string[]) {
    return withRefresh(() => {
      const client = getClient();
      return client.post(`/dictionary/entries/${entryId}/groups`, { groupIds });
    });
  },

  async removeEntryFromGroup(entryId: string, groupId: string) {
    return withRefresh(() => {
      const client = getClient();
      return client.delete(`/dictionary/entries/${entryId}/groups/${groupId}`);
    });
  },

  async getEntryGroups(entryId: string) {
    return withRefresh(() => {
      const client = getClient();
      return client.get<SemanticGroupResponse[]>(`/dictionary/entries/${entryId}/groups`);
    });
  },

  // Word Lookup with Related
  async getWordWithRelated(term: string) {
    return withRefresh(() => {
      const client = getClient();
      return client.get<WordWithRelatedResponse>(`/dictionary/word/${encodeURIComponent(term)}`);
    });
  },

  // Synonym Groups
  async getSynonymGroups() {
    return withRefresh(() => {
      const client = getClient();
      return client.get<SynonymGroupSummaryResponse[]>("/dictionary/synonyms");
    });
  },

  async getSynonymGroup(id: string) {
    return withRefresh(() => {
      const client = getClient();
      return client.get<SynonymGroupResponse>(`/dictionary/synonyms/${id}`);
    });
  },

  async createSynonymGroup(dto: CreateSynonymGroupDto) {
    return withRefresh(() => {
      const client = getClient();
      return client.post<SynonymGroupResponse>("/dictionary/synonyms", dto);
    });
  },

  async updateSynonymGroup(id: string, dto: UpdateSynonymGroupDto) {
    return withRefresh(() => {
      const client = getClient();
      return client.patch<SynonymGroupResponse>(`/dictionary/synonyms/${id}`, dto);
    });
  },

  async deleteSynonymGroup(id: string) {
    return withRefresh(() => {
      const client = getClient();
      return client.delete(`/dictionary/synonyms/${id}`);
    });
  },

  async addEntriesToSynonymGroup(groupId: string, entryIds: string[]) {
    return withRefresh(() => {
      const client = getClient();
      return client.post<SynonymGroupResponse>(`/dictionary/synonyms/${groupId}/entries`, { entryIds });
    });
  },

  async removeEntryFromSynonymGroup(groupId: string, entryId: string) {
    return withRefresh(() => {
      const client = getClient();
      return client.delete(`/dictionary/synonyms/${groupId}/entries/${entryId}`);
    });
  },

  // Entry Synonym Management
  async getEntrySynonyms(entryId: string) {
    return withRefresh(() => {
      const client = getClient();
      return client.get<SynonymEntryResponse[]>(`/dictionary/entries/${entryId}/synonyms`);
    });
  },

  async getEntrySynonymGroups(entryId: string) {
    return withRefresh(() => {
      const client = getClient();
      return client.get<SynonymGroupSummaryResponse[]>(`/dictionary/entries/${entryId}/synonym-groups`);
    });
  },
};
