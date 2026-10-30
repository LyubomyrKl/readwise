"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isActiveJob } from "@platform/jobs/types";
import { readerApi } from "./api";
import type { DocumentStructure } from "./types";

/** Query keys of the reader; invalidate by prefix. */
export const readerKeys = {
  all: ["reader"] as const,
  books: ["reader", "books"] as const,
  book: (id: string) => ["reader", "book", id] as const,
  notes: (bookId: string) => ["reader", "notes", bookId] as const,
  editions: (bookId: string) => ["reader", "editions", bookId] as const,
  structure: (bookId: string) => ["reader", "structure", bookId] as const,
  editionProgress: (editionId: string) => ["reader", "edition-progress", editionId] as const,
};

export function useBooks() {
  return useQuery({ queryKey: readerKeys.books, queryFn: readerApi.documents.list });
}

export function useBook(id: string | undefined) {
  return useQuery({ queryKey: readerKeys.book(id ?? ""), queryFn: () => readerApi.documents.get(id!), enabled: !!id });
}

export function useBookNotes(bookId: string | undefined) {
  return useQuery({ queryKey: readerKeys.notes(bookId ?? ""), queryFn: () => readerApi.reading.listNotes(bookId!), enabled: !!bookId });
}

/** The abridged editions of a book; refreshes while one is being made. */
export function useBookEditions(bookId: string | undefined, activeIntervalMs = 5000) {
  return useQuery({
    queryKey: readerKeys.editions(bookId ?? ""),
    queryFn: () => readerApi.editions.listForBook(bookId!),
    enabled: !!bookId,
    refetchInterval: (query) => (query.state.data?.some((e) => isActiveJob(e.job?.status)) ? activeIntervalMs : false),
  });
}

/** The chapters of an edition being made; refreshes while it is active. */
export function useEditionProgress(editionId: string | undefined, active: boolean, intervalMs = 8000) {
  return useQuery({
    queryKey: readerKeys.editionProgress(editionId ?? ""),
    queryFn: () => readerApi.editions.progress(editionId!),
    enabled: !!editionId,
    refetchInterval: active ? intervalMs : false,
  });
}

/** The book as read on upload (contents, kinds, sizes); absent until reader.ingest has run. */
export function useBookStructure(bookId: string | undefined) {
  return useQuery({
    queryKey: readerKeys.structure(bookId ?? ""),
    queryFn: () => readerApi.documents.structure(bookId!),
    enabled: !!bookId,
    retry: false,
    select: (response) => response.structure as unknown as DocumentStructure,
  });
}

/** Invalidates the reader's cached data (after uploads, deletions, new editions). */
export function useInvalidateReader() {
  const client = useQueryClient();
  return (bookId?: string) =>
    bookId
      ? Promise.all([
          client.invalidateQueries({ queryKey: readerKeys.book(bookId) }),
          client.invalidateQueries({ queryKey: readerKeys.editions(bookId) }),
          client.invalidateQueries({ queryKey: readerKeys.notes(bookId) }),
          client.invalidateQueries({ queryKey: readerKeys.books }),
        ])
      : client.invalidateQueries({ queryKey: readerKeys.all });
}
