"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  BookOpen,
  Clock,
  Star,
  Bookmark,
  Sparkles,
  ChevronRight,
  Heart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import React from "react";
import { BookCard, Stat } from "./components";
import { useCoverGradient } from "@/hooks/useCoverGradient";
import { useMotion } from "@/app/(providers)/MotionProvider/MotionProvider";
import { apiFetch } from "@/lib/fetcher";
import { IBook } from "../types";

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

function prettyDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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

  const { enabled } = useMotion();

  // Fetch books on component mount
  React.useEffect(() => {
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

  const progress = (
    book: { pageCount?: number; pagePassCount: number },
    round?: boolean
  ) => {
    const value = book.pageCount
      ? (book.pagePassCount / book.pageCount) * 100
      : 0;
    return round ? Math.round(value) : value;
  };

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    let data = books.filter(
      (b) =>
        !q ||
        b.title.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q)
    );

    if (filter === "inprogress") data = data.filter((b) => !b.isFinished);
    if (filter === "finished") data = data.filter((b) => b.isFinished);
    if (filter === "favorites") data = data.filter((b) => b.isFavorite);

    if (sortBy === "alphabetical")
      data.sort((a, b) => a.title.localeCompare(b.title));
    if (sortBy === "progress") data.sort((a, b) => progress(b) - progress(a));
    if (sortBy === "time") data.sort((a, b) => b.spentHours - a.spentHours);
    if (sortBy === "recent")
      data.sort(
        (a, b) =>
          Number(b.isFavorite) - Number(a.isFavorite) ||
          a.title.localeCompare(b.title)
      );

    return data;
  }, [query, filter, sortBy]);

  const getMinutesLeft = (
    book: {
      pageCount?: number;
      pagePassCount: number;
      spentHours: number;
    },
    format: "short" | "long"
  ) => {
    if (!book.pageCount) return "Unknown time left";

    const pagesLeft = book.pageCount - book.pagePassCount;
    const avgTimePerPage =
      (book.spentHours * 60) / book.pagePassCount
        ? (book.spentHours * 60) / book.pagePassCount
        : 0;
    const minutesLeft = Math.round(pagesLeft * avgTimePerPage);

    return format === "short"
      ? `${Math.round(minutesLeft / 60)}h ${minutesLeft % 60}m`
      : `${Math.floor(minutesLeft / 60)} hours and ${minutesLeft % 60} minutes`;
  };

  const dynamicBg = useCoverGradient(lastBook.cover);

  const Wrapper: any = enabled ? motion.div : "div";
  const Child: any = enabled ? motion.div : "div";

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      <div className="pointer-events-none absolute top-0 left-0 right-0 h-[65vh] -z-10">
        <Image
          src={lastBook.cover}
          alt=""
          fill
          className="object-cover blur-2xl opacity-20 scale-110"
          priority
        />
        <div
          className="absolute inset-0"
          style={{ backgroundImage: dynamicBg }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/50 to-transparent" />
      </div>

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

        <Wrapper
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <Card className="overflow-hidden border-0 shadow-lg ring-1 ring-border/50">
            <CardHeader className="gap-1 pb-2">
              <CardTitle className="flex items-center gap-2 text-xl">
                <BookOpen className="h-5 w-5" /> Last read
              </CardTitle>
              <CardDescription>Pick up right where you stopped</CardDescription>
            </CardHeader>

            <CardContent className="grid grid-cols-1 gap-6 pb-2 md:grid-cols-[220px_1fr]">
              <div className="relative mx-auto h-[300px] w-[220px] overflow-hidden rounded-2xl shadow-md md:mx-0">
                <Image
                  src={lastBook.cover}
                  alt={`${lastBook.title} cover`}
                  fill
                  sizes="220px"
                  className="object-cover"
                  priority
                />
              </div>

              <div className="flex flex-col justify-between">
                <div className="space-y-3">
                  <h2 className="text-lg font-semibold leading-tight sm:text-xl">
                    {lastBook.title}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    by {lastBook.author}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Clock className="h-4 w-4" /> Last read{" "}
                      {prettyDate(lastBook.lastReadAt)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Star className="h-4 w-4" /> {lastBook.rating}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Bookmark className="h-4 w-4" /> {lastBook.currentChapter}
                    </span>
                  </div>
                  <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                    {lastBook.description}
                  </p>
                  <div className="mt-4">
                    <div className="mb-2 flex items-center justify-between text-xs">
                      <span className="color-inherit">
                        {lastBook.pagePassCount} / {lastBook.pageCount} pages
                        read{" "}
                        <span className="text-muted-foreground">
                          ~ {progress(lastBook, true)}%
                        </span>
                      </span>

                      <span>~{getMinutesLeft(lastBook, "short")} min left</span>
                    </div>

                    <Progress value={progress(lastBook)} className="h-2" />
                  </div>
                </div>

                <div className="mt-1 flex gap-2">
                  {lastBook.tags.map((t) => (
                    <Badge
                      key={t}
                      variant="secondary"
                      className="backdrop-blur"
                    >
                      {t}
                    </Badge>
                  ))}
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <Button asChild size="sm">
                    <Link href={`/reader/${lastBook.id}`}>
                      Continue reading
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="secondary">
                    <Link href={`/books/${lastBook.id}`}>View details</Link>
                  </Button>
                </div>
              </div>
            </CardContent>

            <CardFooter className="flex flex-wrap items-center gap-4 border-t bg-muted/30 px-6 py-4">
              <Stat label="Total pages" value="464" />
              <Stat label="Notes" value="18" />
              <Stat label="Highlights" value="73" />
            </CardFooter>
          </Card>
        </Wrapper>

        {/* Book list */}

        {/* Controls */}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setFilter("all")}
              className={`rounded-full px-3 py-1.5 text-xs ring-1 transition ${
                filter === "all"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground ring-border"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter("inprogress")}
              className={`rounded-full px-3 py-1.5 text-xs ring-1 transition ${
                filter === "inprogress"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground ring-border"
              }`}
            >
              In progress
            </button>
            <button
              onClick={() => setFilter("finished")}
              className={`rounded-full px-3 py-1.5 text-xs ring-1 transition ${
                filter === "finished"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground ring-border"
              }`}
            >
              Finished
            </button>
            <button
              onClick={() => setFilter("favorites")}
              className={`rounded-full px-3 py-1.5 text-xs ring-1 transition ${
                filter === "favorites"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground ring-border"
              }`}
            >
              Favorites
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by title or author"
                className="h-9 w-64 rounded-xl border bg-background px-3 text-sm ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="h-9 rounded-xl border bg-background px-3 text-sm ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="recent">Sort: Recent</option>
              <option value="alphabetical">Sort: A-Z</option>
              <option value="progress">Sort: Progress</option>
              <option value="time">Sort: Time spent</option>
            </select>
          </div>
        </div>

        {/* Books grid */}
        {loading ? (
          <div className="mt-8 flex justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading your books...</p>
            </div>
          </div>
        ) : error ? (
          <div className="mt-8 text-center">
            <p className="text-red-500 mb-4">Error: {error}</p>
            <Button onClick={() => window.location.reload()} variant="outline">
              Try again
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="mt-8 text-center">
            <div className="mx-auto w-64 h-48 mb-6 flex items-center justify-center bg-muted rounded-lg">
              <BookOpen className="h-16 w-16 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">
              {books.length === 0
                ? "No books in your library"
                : "No books match your filters"}
            </h3>
            <p className="text-muted-foreground mb-6">
              {books.length === 0
                ? "Start building your digital library by adding your first book."
                : "Try adjusting your search or filter criteria."}
            </p>
            {books.length === 0 && (
              <Button asChild>
                <Link href="/ingest/upload">
                  <Sparkles className="mr-2 h-4 w-4" /> Add your first book
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <Child
            initial="hidden"
            animate="show"
            variants={{
              hidden: { opacity: 0 },
              show: { opacity: 1, transition: { staggerChildren: 0.05 } },
            }}
            className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
          >
            {filtered.map((b) => (
              <BookCard key={b.id} book={b} />
            ))}
          </Child>
        )}
      </section>
    </div>
  );
}
