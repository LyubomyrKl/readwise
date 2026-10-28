"use client";

import Link from "next/link";
import {BookPlus, Sparkles} from "lucide-react";
import { Button } from "@/components/ui/button";
import React, { useMemo } from "react";
import { LastReadCard, LibraryFilters, BooksGrid } from "@tools/reader/documents/library";
import { useCoverGradient } from "@tools/reader/documents/useCoverGradient";
import { useBooks, useLatestSummaries } from "@tools/reader/queries";
import { IBook } from "@tools/reader/types";
import { filterAndSortBooks } from "@tools/reader/documents/library/utils";


import { READER_ROUTES } from "@tools/reader/routes";
export default function LibraryPage() {
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<
    "all" | "inprogress" | "finished" | "favorites"
  >("all");
  const [sortBy, setSortBy] = React.useState<
    "recent" | "progress" | "alphabetical" | "time"
  >("recent");
  const booksQuery = useBooks();
  const latestSummaries = useLatestSummaries();
  const books = useMemo(() => booksQuery.data ?? [], [booksQuery.data]);
  const summaries = latestSummaries.data ?? {};
  const loading = booksQuery.isPending;
  const error = booksQuery.error ? booksQuery.error.message || "Failed to fetch books" : null;

  const lastBook = useMemo<IBook | null>(() => {
    const toTs = (d: unknown) => {
      if (!d) return 0;
      const t = new Date(d as string).getTime();
      return Number.isFinite(t) ? t : 0;
    };
    return books.reduce<IBook | null>((best, b) => (toTs(b.lastAccessed) > toTs(best?.lastAccessed) ? b : best), null);
  }, [books]);

  const filtered = useMemo(() => {
    return filterAndSortBooks(books, query, filter, sortBy);
  }, [books, query, filter, sortBy]);

  const dynamicBg = useCoverGradient(lastBook?.coverUrl);

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      <section className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-4 sm:py-8 md:px-6 lg:px-8">
        <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl md:text-3xl">
              Library
            </h1>
            <p className="mt-0.5 sm:mt-1 text-xs sm:text-sm text-muted-foreground">
              Your last read and all books
            </p>
          </div>
          <Button asChild variant="secondary" className={'gap-0 w-full sm:w-auto'} size="sm">
                <Link href={READER_ROUTES.upload}>
              <BookPlus className="mr-2 h-4 w-4" /> <span>Add books</span>
            </Link>
          </Button>
        </div>

        {lastBook && <LastReadCard lastBook={lastBook} dynamicBg={dynamicBg} />}

        <LibraryFilters
          query={query}
          setQuery={setQuery}
          filter={filter}
          setFilter={setFilter}
          sortBy={sortBy}
          setSortBy={setSortBy}
        />

        <BooksGrid
          books={books}
          filteredBooks={filtered}
          loading={loading}
          error={error}
          summaries={summaries}
        />
      </section>
    </div>
  );
}
