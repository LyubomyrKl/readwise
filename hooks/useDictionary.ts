"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/fetcher";
import type {
  CollocationResponse,
  CreateCollocationDto,
  CreateDictionaryEntryDto,
  CreateSemanticGroupDto,
  CreateSynonymGroupDto,
  DictionaryEntryResponse,
  DictionarySearchQuery,
  DictionarySearchResult,
  DictionaryStatsResponse,
  LearningNoteResponse,
  SemanticGroupResponse,
  SynonymEntryResponse,
  SynonymGroupResponse,
  SynonymGroupSummaryResponse,
  UpdateDictionaryEntryDto,
  UpdateSemanticGroupDto,
  UpdateSynonymGroupDto,
  WordWithRelatedResponse,
} from "@/lib/types";

// Hook for managing dictionary entries
export function useDictionaryEntries(initialQuery?: DictionarySearchQuery) {
  const [entries, setEntries] = useState<DictionaryEntryResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState<DictionarySearchQuery>(initialQuery || {});
  const fetchedRef = useRef(false);

  const fetchEntries = useCallback(async (searchQuery?: DictionarySearchQuery) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = searchQuery || query;
      const queryParams = new URLSearchParams();
      if (params.q) queryParams.set("q", params.q);
      if (params.masteryLevel !== undefined) queryParams.set("masteryLevel", String(params.masteryLevel));
      if (params.tag) queryParams.set("tag", params.tag);
      if (params.sortBy) queryParams.set("sortBy", params.sortBy);
      if (params.sortOrder) queryParams.set("sortOrder", params.sortOrder);
      if (params.skip !== undefined) queryParams.set("skip", String(params.skip));
      if (params.take !== undefined) queryParams.set("take", String(params.take));

      const queryString = queryParams.toString();
      const url = `/api/dictionary/entries${queryString ? `?${queryString}` : ""}`;

      // Use native fetch with query params since apiFetch doesn't support them
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch entries");
      const data = (await response.json()) as DictionaryEntryResponse[];
      setEntries(data);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch entries";
      setError(message);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [query]);

  const createEntry = useCallback(async (dto: CreateDictionaryEntryDto) => {
    try {
      const newEntry = await apiFetch("POST", "/api/dictionary/entries", dto);
      setEntries((prev) => [newEntry, ...prev]);
      return newEntry;
    } catch (err) {
      throw err;
    }
  }, []);

  const updateEntry = useCallback(
    async (id: string, dto: UpdateDictionaryEntryDto) => {
      try {
        const updated = await apiFetch(
          "PATCH",
          "/api/dictionary/entries/[id]",
          dto,
          { id }
        );
        setEntries((prev) => prev.map((e) => (e.id === id ? updated : e)));
        return updated;
      } catch (err) {
        throw err;
      }
    },
    []
  );

  const deleteEntry = useCallback(async (id: string) => {
    try {
      await apiFetch("DELETE", "/api/dictionary/entries/[id]", undefined, { id });
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      throw err;
    }
  }, []);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetchEntries();
  }, [fetchEntries]);

  return {
    entries,
    isLoading,
    error,
    query,
    setQuery,
    fetchEntries,
    createEntry,
    updateEntry,
    deleteEntry,
  };
}

// Hook for a single dictionary entry
export function useDictionaryEntry(entryId: string | null) {
  const [entry, setEntry] = useState<DictionaryEntryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEntry = useCallback(async () => {
    if (!entryId) return null;
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiFetch("GET", "/api/dictionary/entries/[id]", undefined, { id: entryId });
      setEntry(data);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch entry";
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [entryId]);

  useEffect(() => {
    if (entryId) {
      fetchEntry();
    }
  }, [entryId, fetchEntry]);

  return { entry, isLoading, error, refetch: fetchEntry, setEntry };
}

// Hook for collocations management
export function useCollocations(entryId: string) {
  const [isAdding, setIsAdding] = useState(false);
  const [isRemoving, setIsRemoving] = useState<string | null>(null);

  const addCollocation = useCallback(
    async (dto: CreateCollocationDto): Promise<CollocationResponse> => {
      setIsAdding(true);
      try {

        return await apiFetch(
          "POST",
          "/api/dictionary/entries/[id]/collocations",
          dto,
          { id: entryId }
        );
      } finally {
        setIsAdding(false);
      }
    },
    [entryId]
  );

  const removeCollocation = useCallback(
    async (collocationId: string) => {
      setIsRemoving(collocationId);
      try {
        await apiFetch(
          "DELETE",
          "/api/dictionary/entries/[id]/collocations/[collocationId]",
          undefined,
          { id: entryId, collocationId }
        );
      } finally {
        setIsRemoving(null);
      }
    },
    [entryId]
  );

  return { addCollocation, removeCollocation, isAdding, isRemoving };
}

// Hook for creating cards from dictionary entry
export function useCreateCards() {
  const [isCreating, setIsCreating] = useState(false);

  const createCards = useCallback(
    async (entryId: string): Promise<LearningNoteResponse> => {
      setIsCreating(true);
      try {
        const result = await apiFetch(
          "POST",
          "/api/dictionary/entries/[id]/create-cards",
          {},
          { id: entryId }
        );
        return result;
      } finally {
        setIsCreating(false);
      }
    },
    []
  );

  return { createCards, isCreating };
}

// Hook for dictionary statistics
export function useDictionaryStats() {
  const [stats, setStats] = useState<DictionaryStatsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const fetchedRef = useRef(false);

  const fetchStats = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiFetch("GET", "/api/dictionary/stats");
      setStats(data);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetchStats();
  }, [fetchStats]);

  return { stats, isLoading, refetch: fetchStats };
}

// Hook for dictionary search (with debounce)
export function useDictionarySearch() {
  const [results, setResults] = useState<DictionarySearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const search = useCallback(async (query: string) => {
    if (!query || query.length < 1) {
      setResults([]);
      return [];
    }

    setIsSearching(true);
    try {
      const url = `/api/dictionary/search?q=${encodeURIComponent(query)}`;
      // Use native fetch with query params since apiFetch doesn't support them
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) throw new Error("Search failed");
      const data = (await response.json()) as DictionarySearchResult[];
      setResults(data);
      return data;
    } catch {
      setResults([]);
      return [];
    } finally {
      setIsSearching(false);
    }
  }, []);

  const clearResults = useCallback(() => {
    setResults([]);
  }, []);

  return { results, isSearching, search, clearResults };
}

// Hook for managing semantic groups
export function useSemanticGroups() {
  const [groups, setGroups] = useState<SemanticGroupResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  const fetchGroups = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/dictionary/groups", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch groups");
      const data = (await response.json()) as SemanticGroupResponse[];
      setGroups(data);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch groups";
      setError(message);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createGroup = useCallback(async (dto: CreateSemanticGroupDto) => {
    const response = await fetch("/api/dictionary/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(dto),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || "Failed to create group");
    }
    const newGroup = (await response.json()) as SemanticGroupResponse;
    setGroups((prev) => [...prev, newGroup].sort((a, b) => a.name.localeCompare(b.name)));
    return newGroup;
  }, []);

  const updateGroup = useCallback(async (id: string, dto: UpdateSemanticGroupDto) => {
    const response = await fetch(`/api/dictionary/groups/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(dto),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || "Failed to update group");
    }
    const updated = (await response.json()) as SemanticGroupResponse;
    setGroups((prev) => prev.map((g) => (g.id === id ? updated : g)));
    return updated;
  }, []);

  const deleteGroup = useCallback(async (id: string) => {
    const response = await fetch(`/api/dictionary/groups/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || "Failed to delete group");
    }
    setGroups((prev) => prev.filter((g) => g.id !== id));
  }, []);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetchGroups();
  }, [fetchGroups]);

  return {
    groups,
    isLoading,
    error,
    fetchGroups,
    createGroup,
    updateGroup,
    deleteGroup,
  };
}

// Hook for entry group management
export function useEntryGroups(entryId: string | null) {
  const [entryGroups, setEntryGroups] = useState<SemanticGroupResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const fetchEntryGroups = useCallback(async () => {
    if (!entryId) return [];
    setIsLoading(true);
    try {
      const response = await fetch(`/api/dictionary/entries/${entryId}/groups`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch entry groups");
      const data = (await response.json()) as SemanticGroupResponse[];
      setEntryGroups(data);
      return data;
    } catch {
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [entryId]);

  const addToGroups = useCallback(
    async (groupIds: string[]) => {
      if (!entryId) return;
      setIsUpdating(true);
      try {
        const response = await fetch(`/api/dictionary/entries/${entryId}/groups`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ groupIds }),
        });
        if (!response.ok) throw new Error("Failed to add to groups");
        await fetchEntryGroups();
      } finally {
        setIsUpdating(false);
      }
    },
    [entryId, fetchEntryGroups]
  );

  const removeFromGroup = useCallback(
    async (groupId: string) => {
      if (!entryId) return;
      setIsUpdating(true);
      try {
        const response = await fetch(`/api/dictionary/entries/${entryId}/groups/${groupId}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!response.ok) throw new Error("Failed to remove from group");
        setEntryGroups((prev) => prev.filter((g) => g.id !== groupId));
      } finally {
        setIsUpdating(false);
      }
    },
    [entryId]
  );

  useEffect(() => {
    if (entryId) {
      fetchEntryGroups();
    }
  }, [entryId, fetchEntryGroups]);

  return {
    entryGroups,
    isLoading,
    isUpdating,
    fetchEntryGroups,
    addToGroups,
    removeFromGroup,
  };
}

// Hook for word lookup with related words
export function useWordLookup() {
  const [data, setData] = useState<WordWithRelatedResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookupWord = useCallback(async (term: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/dictionary/word/${encodeURIComponent(term)}`, {
        credentials: "include",
      });
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Word "${term}" not found`);
        }
        throw new Error("Failed to lookup word");
      }
      const result = (await response.json()) as WordWithRelatedResponse;
      setData(result);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to lookup word";
      setError(message);
      setData(null);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setData(null);
    setError(null);
  }, []);

  return { data, isLoading, error, lookupWord, clear };
}

// Hook for group entries
export function useGroupEntries(groupId: string | null) {
  const [entries, setEntries] = useState<DictionarySearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchEntries = useCallback(async () => {
    if (!groupId) return [];
    setIsLoading(true);
    try {
      const response = await fetch(`/api/dictionary/groups/${groupId}/entries`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch group entries");
      const data = (await response.json()) as DictionarySearchResult[];
      setEntries(data);
      return data;
    } catch {
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    if (groupId) {
      fetchEntries();
    }
  }, [groupId, fetchEntries]);

  return { entries, isLoading, fetchEntries };
}

// ===== Synonym Group Hooks =====

// Hook for managing synonym groups
export function useSynonymGroups() {
  const [groups, setGroups] = useState<SynonymGroupSummaryResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  const fetchGroups = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/dictionary/synonyms", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch synonym groups");
      const data = (await response.json()) as SynonymGroupSummaryResponse[];
      setGroups(data);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch synonym groups";
      setError(message);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createGroup = useCallback(async (dto: CreateSynonymGroupDto) => {
    const response = await fetch("/api/dictionary/synonyms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(dto),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || "Failed to create synonym group");
    }
    const newGroup = (await response.json()) as SynonymGroupResponse;
    setGroups((prev) => [{
      id: newGroup.id,
      name: newGroup.name,
      entryCount: newGroup.entryCount,
      createdAt: newGroup.createdAt,
      updatedAt: newGroup.updatedAt,
    }, ...prev]);
    return newGroup;
  }, []);

  const updateGroup = useCallback(async (id: string, dto: UpdateSynonymGroupDto) => {
    const response = await fetch(`/api/dictionary/synonyms/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(dto),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || "Failed to update synonym group");
    }
    const updated = (await response.json()) as SynonymGroupResponse;
    setGroups((prev) => prev.map((g) => (g.id === id ? {
      id: updated.id,
      name: updated.name,
      entryCount: updated.entryCount,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    } : g)));
    return updated;
  }, []);

  const deleteGroup = useCallback(async (id: string) => {
    const response = await fetch(`/api/dictionary/synonyms/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || "Failed to delete synonym group");
    }
    setGroups((prev) => prev.filter((g) => g.id !== id));
  }, []);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetchGroups();
  }, [fetchGroups]);

  return {
    groups,
    isLoading,
    error,
    fetchGroups,
    createGroup,
    updateGroup,
    deleteGroup,
  };
}

// Hook for a single synonym group with entries
export function useSynonymGroup(groupId: string | null) {
  const [group, setGroup] = useState<SynonymGroupResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGroup = useCallback(async () => {
    if (!groupId) return null;
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/dictionary/synonyms/${groupId}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch synonym group");
      const data = (await response.json()) as SynonymGroupResponse;
      setGroup(data);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch synonym group";
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [groupId]);

  const addEntries = useCallback(async (entryIds: string[]) => {
    if (!groupId) return null;
    const response = await fetch(`/api/dictionary/synonyms/${groupId}/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ entryIds }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || "Failed to add entries");
    }
    const updated = (await response.json()) as SynonymGroupResponse;
    setGroup(updated);
    return updated;
  }, [groupId]);

  const removeEntry = useCallback(async (entryId: string) => {
    if (!groupId) return;
    const response = await fetch(`/api/dictionary/synonyms/${groupId}/entries/${entryId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || "Failed to remove entry");
    }
    // Check if group was deleted (returns success empty response)
    const data = await response.json();
    if (data.status === "success") {
      setGroup(null);
      return null;
    }
    setGroup(data as SynonymGroupResponse);
    return data as SynonymGroupResponse;
  }, [groupId]);

  useEffect(() => {
    if (groupId) {
      fetchGroup();
    }
  }, [groupId, fetchGroup]);

  return { group, isLoading, error, fetchGroup, addEntries, removeEntry, setGroup };
}

// Hook for entry synonyms
export function useEntrySynonyms(entryId: string | null) {
  const [synonyms, setSynonyms] = useState<SynonymEntryResponse[]>([]);
  const [synonymGroups, setSynonymGroups] = useState<SynonymGroupSummaryResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchSynonyms = useCallback(async () => {
    if (!entryId) return;
    setIsLoading(true);
    try {
      const [synonymsRes, groupsRes] = await Promise.all([
        fetch(`/api/dictionary/entries/${entryId}/synonyms`, { credentials: "include" }),
        fetch(`/api/dictionary/entries/${entryId}/synonym-groups`, { credentials: "include" }),
      ]);

      if (synonymsRes.ok) {
        const data = (await synonymsRes.json()) as SynonymEntryResponse[];
        setSynonyms(data);
      }
      if (groupsRes.ok) {
        const data = (await groupsRes.json()) as SynonymGroupSummaryResponse[];
        setSynonymGroups(data);
      }
    } finally {
      setIsLoading(false);
    }
  }, [entryId]);

  useEffect(() => {
    if (entryId) {
      fetchSynonyms();
    }
  }, [entryId, fetchSynonyms]);

  return { synonyms, synonymGroups, isLoading, fetchSynonyms };
}
