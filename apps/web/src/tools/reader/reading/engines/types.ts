import type { Locator } from "../locator";

/**
 * The contract between the reader shell (chrome, panels, persistence) and an engine that renders
 * one family of formats: PdfEngine (PDF.js) for fixed layout, ReflowEngine (foliate-js) for
 * reflowable books. Everything the shell stores goes through Locator v2, so the shell never knows
 * a CFI from a quad. docs/document-architecture.md has the reasoning.
 */

export type TocItem = {
  id: string;
  label: string;
  level: number;
  /** what the engine needs to go there (a PDF destination, an href) */
  target: unknown;
  /** printed page or chapter number to show next to it, when known */
  pageLabel?: string;
};

export type OpenedBook = {
  toc: TocItem[];
  /** fixed layout: number of pages; reflowable: number of locations */
  total: number;
  /** what one unit of `total` is called */
  unit: "page" | "location";
};

export type Relocation = {
  locator: Locator;
  /** 0..100 */
  percent: number;
  /** short text for the bottom bar ("12 / 300", "xlii", "Location 120 of 4,013") */
  label: string;
  /** the chapter or outline entry the view is in */
  tocLabel?: string;
};

export type ViewportRect = { x: number; y: number; width: number; height: number };

export type TextSelection = {
  locator: Locator;
  /** the selected text as shown (for the popover and the highlight's text column) */
  text: string;
  /** where it is on screen, for the popover */
  rect: ViewportRect;
};

export type HighlightItem = { id: string; locator: Locator; color: string };

export type SearchHit = {
  locator: Locator;
  excerpt: { pre: string; match: string; post: string };
  /** where the hit is: a chapter title or a page label */
  label?: string;
};

export type ReaderTheme = "light" | "sepia" | "dark";

export type ReaderPreferences = {
  theme: ReaderTheme;
  /** reflowable: 0.7..1.8 */
  fontScale: number;
  /** reflowable: 1.2..2.0 */
  lineHeight: number;
  /** reflowable */
  flow: "paginated" | "scrolled";
  /** fixed layout: a scale, or fit to the width */
  zoom: number | "page-width";
};

export const DEFAULT_PREFERENCES: ReaderPreferences = {
  theme: "light",
  fontScale: 1,
  lineHeight: 1.5,
  flow: "paginated",
  zoom: "page-width",
};

export type EngineEvents = {
  onRelocate: (relocation: Relocation) => void;
  onSelection: (selection: TextSelection | null) => void;
  /** a highlight was tapped */
  onHighlightClick: (id: string, rect: ViewportRect | null) => void;
  /** a fallback found a highlight's text elsewhere: store the refreshed caches */
  onAnchorUpdate?: (id: string, locator: Locator) => void;
  onError?: (error: Error) => void;
};

export type BookSource = {
  /** same-origin URL of the file; ranges are honoured */
  fileUrl: string;
  mime: string;
  /** the book id, for keys and logs */
  id: string;
  /** reflowable: base URL of the server rendition, when one exists */
  renditionUrl?: string | null;
};

export interface ReaderEngine {
  readonly format: Locator["format"];
  open(container: HTMLElement, start: Locator | null, preferences: ReaderPreferences): Promise<OpenedBook>;
  goTo(target: Locator | TocItem): Promise<void>;
  goToPercent(percent: number): Promise<void>;
  next(): Promise<void>;
  prev(): Promise<void>;
  setHighlights(items: HighlightItem[]): void;
  search(query: string): AsyncGenerator<SearchHit>;
  clearSearch(): void;
  setPreferences(preferences: ReaderPreferences): void;
  /** clears the text selection in the book (after a highlight was made) */
  clearSelection(): void;
  destroy(): void;
}
