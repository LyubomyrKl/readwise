"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import React, { useEffect, useMemo } from "react";
import { LastReadCard, LibraryFilters, BooksGrid } from "./components";
import { useCoverGradient } from "@/hooks/useCoverGradient";
import { apiFetch } from "@/lib/fetcher";
import { IBook } from "../types";
import { filterAndSortBooks } from "./utils";

const lastBook = {
  id: "clean-code",
  title: "Clean Code: A Handbook of Agile Software Craftsmanship",
  author: "Robert C. Martin",
  cover: "https://m.media-amazon.com/images/I/51E2055ZGUL._SY425_.jpg",
  pageCount: 521,
  pagePassCount: 65,
  spentHours: 1.5,
  lastReadAt: "2025-08-08T21:10:00Z",
  currentChapter: "Chapter 10 – Classes",
  rating: 4.7,
  tags: ["Software", "Craft", "Best practices"],
  minutesLeft: 175,
  description:
    "Practical principles for writing maintainable, readable code. Focuses on naming, functions, classes, error handling, and tests with real refactoring examples.",
};

export default function LibraryPage() {
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<
    "all" | "inprogress" | "finished" | "favorites"
  >("all");
  const [sortBy, setSortBy] = React.useState<
    "recent" | "progress" | "alphabetical" | "time"
  >("recent");
  const [books, setBooks] = React.useState<IBook[]>([]);
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

  const dynamicBg = useCoverGradient(lastBook.cover);

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
            <Link href="/ingest/upload">
              <Sparkles className="mr-2 h-4 w-4" /> Add books
            </Link>
          </Button>
        </div>

        <LastReadCard dynamicBg={dynamicBg} />

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
