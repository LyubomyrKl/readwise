import { IBook } from "../types";

export function prettyDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function progress(
  book: { pageCount?: number | null; pagePassCount: number },
  round?: boolean
) {
  const value =
    book.pageCount
      ? (book.pagePassCount / book.pageCount) * 100
      : 0;
  return round ? Math.round(value) : value;
}

export function getMinutesLeft(
  book: {
    pageCount?: number;
    pagePassCount: number;
    spentHours: number;
  },
  format: "short" | "long"
) {
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
}

export function filterAndSortBooks(
  books: IBook[],
  query: string,
  filter: "all" | "inprogress" | "finished" | "favorites",
  sortBy: "recent" | "progress" | "alphabetical" | "time"
) {
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
}