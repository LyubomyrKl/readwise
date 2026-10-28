"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isActiveJob } from "@platform/jobs/types";
import { readerApi } from "./api";
import type { SummaryResponse } from "./types";

/** Query keys of the reader; invalidate by prefix. */
export const readerKeys = {
  all: ["reader"] as const,
  books: ["reader", "books"] as const,
  book: (id: string) => ["reader", "book", id] as const,
  notes: (bookId: string) => ["reader", "notes", bookId] as const,
  summaries: (bookId: string) => ["reader", "summaries", bookId] as const,
  latestSummaries: ["reader", "summaries", "latest"] as const,
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

/** The summaries of a book; refreshes while one of them is being generated. */
export function useBookSummaries(bookId: string | undefined, activeIntervalMs = 5000) {
  return useQuery({
    queryKey: readerKeys.summaries(bookId ?? ""),
    queryFn: () => readerApi.summaries.listForBook(bookId!),
    enabled: !!bookId,
    refetchInterval: (query) => (query.state.data?.some((s) => isActiveJob(s.job?.status)) ? activeIntervalMs : false),
  });
}

/** Newest summary per book, for the library badges. */
export function useLatestSummaries() {
  return useQuery({
    queryKey: readerKeys.latestSummaries,
    queryFn: () => readerApi.summaries.listAll({ latestPerBook: true }),
    select: (list): Record<string, SummaryResponse> => Object.fromEntries(list.map((s) => [s.bookId, s])),
  });
}

/** Invalidates the reader's cached data (after uploads, deletions, new summaries). */
export function useInvalidateReader() {
  const client = useQueryClient();
  return (bookId?: string) =>
    bookId
      ? Promise.all([
          client.invalidateQueries({ queryKey: readerKeys.book(bookId) }),
          client.invalidateQueries({ queryKey: readerKeys.summaries(bookId) }),
          client.invalidateQueries({ queryKey: readerKeys.notes(bookId) }),
          client.invalidateQueries({ queryKey: readerKeys.books }),
          client.invalidateQueries({ queryKey: readerKeys.latestSummaries }),
        ])
      : client.invalidateQueries({ queryKey: readerKeys.all });
}
