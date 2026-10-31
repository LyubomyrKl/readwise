import type { Quote } from "./quote";

export type BookFormat = "pdf" | "epub";

/**
 * A place in a book: a reading position, the target of a highlight or a note, later a citation.
 * Several redundant parts, tried from the most precise to the most robust when it is opened again
 * (docs/document-architecture.md, Locator v2); the quote is the record, the rest are caches that
 * are rewritten when a fallback finds the text elsewhere. Stored as JSON in the anchor and
 * readingPosition columns; `v: 2` tells it from the format before it.
 */
export type Locator = {
  v: 2;
  format: BookFormat;
  /** reflowable: the chapter's path in the book (the same in the original and the rendition) */
  href?: string;
  /** reflowable: data-wb-b ids of the first and last block covered (rendition only) */
  blocks?: string[];
  /** reflowable: engine cache, a CFI point or range */
  cfi?: string;
  /** fixed layout: 0-based page index */
  page?: number;
  /** fixed layout: the printed label of that page ("xlii", "57") */
  pageLabel?: string;
  /** fixed layout: highlight quads in PDF user space, 8 numbers each (x1,y1 x2,y2 x3,y3 x4,y4) */
  quads?: number[][];
  /** fixed layout: the same selection on the pages after `page` */
  continuation?: { page: number; quads: number[][] }[];
  /** normalized text, with up to 32 characters of context on each side */
  quote?: Quote;
  /** code points into the normalized text of the chapter (reflowable) or page (fixed) */
  position?: { start: number; end: number };
  /** 0..1 within the chapter or page */
  progression?: number;
  /** 0..1 in the book */
  totalProgression?: number;
  /** which engine computed the caches, e.g. "pdfjs-6.4.299" or "foliate-78914ae" */
  engine?: string;
};

/** The format before v2: a page or a CFI, and a percentage. */
export type LegacyAnchor = {
  type?: "pdf" | "epub";
  page?: number;
  cfi?: string;
  percentage?: number;
  rects?: unknown;
};

export function isLocator(value: unknown): value is Locator {
  return !!value && typeof value === "object" && (value as { v?: unknown }).v === 2;
}

/**
 * Any stored anchor or position as a Locator: v2 as it is; v1 by what it carries (a 1-based page
 * becomes a 0-based index, a CFI stays a CFI to try first, the percentage a total progression).
 */
export function toLocator(value: unknown, format: BookFormat): Locator | null {
  if (!value || typeof value !== "object") return null;
  if (isLocator(value)) return value;
  const legacy = value as LegacyAnchor;
  const locator: Locator = { v: 2, format: legacy.type ?? format };
  if (typeof legacy.page === "number" && legacy.page >= 1) locator.page = legacy.page - 1;
  if (typeof legacy.cfi === "string" && legacy.cfi) locator.cfi = legacy.cfi;
  if (typeof legacy.percentage === "number") locator.totalProgression = Math.max(0, Math.min(1, legacy.percentage / 100));
  return locator.page !== undefined || locator.cfi || locator.totalProgression !== undefined ? locator : null;
}

/** Percent of the book for the old `percentage` field and the progress bar. */
export function percentOf(locator: Locator | null | undefined): number {
  return Math.round(Math.max(0, Math.min(1, locator?.totalProgression ?? 0)) * 100);
}
