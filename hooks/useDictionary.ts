"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/fetcher";
import type {
  CollocationResponse,
  CreateCollocationDto,
  CreateDictionaryEntryDto,
  DictionaryEntryResponse,
  DictionarySearchQuery,
  DictionarySearchResult,
  DictionaryStatsResponse,
  LearningNoteResponse,
  UpdateDictionaryEntryDto,
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
