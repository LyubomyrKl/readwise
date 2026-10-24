"use client";

import Link from "next/link";
import {BookPlus, Sparkles} from "lucide-react";
import { Button } from "@/components/ui/button";
import React, { useEffect, useMemo, useRef } from "react";
import { LastReadCard, LibraryFilters, BooksGrid } from "@tools/reader/documents/library";
import { useCoverGradient } from "@tools/reader/documents/useCoverGradient";
import { apiFetch } from "@/lib/fetcher";
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
  const [books, setBooks] = React.useState<IBook[]>([]);
  const [lastBook, setLastBook] = React.useState<IBook | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const fetchedRef = useRef(false);

  // Fetch books on component mount
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    const fetchBooks = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await apiFetch("GET", "/api/books");
        setBooks(data);

        const toTs = (d: unknown) => {
          if (!d) return 0;
          const t = new Date(d as any).getTime();
          return Number.isFinite(t) ? t : 0;
        };

        const lastBook = data.reduce((best, b) =>
            toTs(b.lastAccessed) > toTs(best?.lastAccessed) ? b : best
          , null as typeof data[number] | null);

        setLastBook(lastBook);

      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch books");
      } finally {
        setLoading(false);
      }
    };

    fetchBooks();
  }, []);

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
        />
      </section>
    </div>
  );
}
