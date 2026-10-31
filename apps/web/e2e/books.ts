import { existsSync, readFileSync } from "fs";
import { join } from "path";

export const BOOKS_DIR = process.env.READER_BOOKS ?? "/tmp/wbtest/books";
export const STATE_DIR = join(__dirname, ".state");

/** The books the tests open, when they are in BOOKS_DIR (never committed: real books). */
export const BOOKS = {
  bigPdf: { file: "big-1000.pdf", mime: "application/pdf", title: "A thousand pages of text" },
  scanPdf: { file: "big-scan.pdf", mime: "application/pdf", title: "An illustrated book of 184 MB" },
  paperPdf: { file: "dropout.pdf", mime: "application/pdf", title: "Dropout paper" },
  englishEpub: { file: "russell.epub", mime: "application/epub+zip", title: "The Problems of Philosophy" },
  russianEpub: { file: "moskovia.epub", mime: "application/epub+zip", title: "Московия" },
} as const;

export type BookKey = keyof typeof BOOKS;

export function bookPath(key: BookKey): string {
  return join(BOOKS_DIR, BOOKS[key].file);
}

export function hasBook(key: BookKey): boolean {
  return existsSync(bookPath(key));
}

/** Book ids written by the global setup. */
export function uploadedIds(): Partial<Record<BookKey, string>> {
  const path = join(STATE_DIR, "books.json");
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf-8")) as Partial<Record<BookKey, string>>) : {};
}
