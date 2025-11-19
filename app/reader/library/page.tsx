"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import React, { useEffect, useMemo } from "react";
import { LastReadCard, LibraryFilters, BooksGrid } from "./(components)";
import { useCoverGradient } from "@/hooks/useCoverGradient";
import { apiFetch } from "@/lib/fetcher";
import { IBook } from "../types";
import { filterAndSortBooks } from "./utils";
import { ROUTES } from '@/app/(consts)/routes';


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

  // Fetch books on component mount
  useEffect(() => {
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
      <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Library
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Your last read and all books
            </p>
          </div>
          <Button asChild variant="secondary">
            <Link href={ROUTES.reader.ingest.uploadFiles}>
              <Sparkles className="mr-2 h-4 w-4" /> Add books
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
