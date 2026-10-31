/**
 * The parts of the vendored foliate-js (src/vendor/foliate-js, plain JavaScript) the reflowable
 * engine uses, typed here once.
 */

export type FoliateSection = { id: string; size?: number; linear?: string; cfi?: string };

export type FoliateTocItem = { label?: string; href?: string; subitems?: FoliateTocItem[] };

export type FoliateBook = {
  sections: FoliateSection[];
  toc?: FoliateTocItem[];
  pageList?: FoliateTocItem[];
  metadata?: { title?: unknown; author?: unknown; language?: unknown; description?: unknown };
  transformTarget?: EventTarget;
  getCover?: () => Promise<Blob | null>;
  destroy?: () => void;
};

export type FoliateRelocate = {
  fraction?: number;
  section?: { current: number; total: number };
  location?: { current: number; next: number; total: number };
  tocItem?: { label?: string; href?: string } | null;
  pageItem?: { label?: string } | null;
  cfi?: string;
  range?: Range | null;
};

type Draw = (fn: unknown, options: { color: string }) => void;

type FoliateEvents = {
  load: CustomEvent<{ doc: Document; index: number }>;
  relocate: CustomEvent<FoliateRelocate>;
  "create-overlay": CustomEvent<{ index: number }>;
  "draw-annotation": CustomEvent<{ draw: Draw; annotation: { value: string; color: string }; doc: Document; range: Range }>;
  "show-annotation": CustomEvent<{ value: string; index: number; range: Range | null }>;
};

export type FoliateRenderer = HTMLElement & {
  setStyles?: (css: string | [string, string]) => void;
  getContents?: () => { doc: Document; index: number; overlayer?: unknown }[];
};

export type FoliateSearchResult =
  | "done"
  | { progress: number }
  | { label?: string; subitems?: { cfi: string; excerpt: { pre: string; match: string; post: string } }[] };

export interface FoliateView extends HTMLElement {
  renderer?: FoliateRenderer;
  book?: FoliateBook;
  open(book: FoliateBook): Promise<void>;
  close(): void;
  init(options: { lastLocation: string | null; showTextStart: boolean }): Promise<void>;
  goTo(target: string | number): Promise<unknown>;
  goToFraction(fraction: number): Promise<void>;
  next(distance?: number): Promise<void>;
  prev(distance?: number): Promise<void>;
  getCFI(index: number, range: Range): string;
  resolveNavigation(target: string | number): { index: number; anchor?: (doc: Document) => Range | Element } | undefined;
  getSectionFractions?(): number[];
  addAnnotation(annotation: { value: string; color?: string }, remove?: boolean): Promise<unknown>;
  deleteAnnotation(annotation: { value: string }): Promise<unknown>;
  search(options: { query: string }): AsyncGenerator<FoliateSearchResult>;
  clearSearch(): void;
  addEventListener<K extends keyof FoliateEvents>(type: K, listener: (event: FoliateEvents[K]) => void): void;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
}

export type OverlayerStatic = { highlight: unknown; underline: unknown; outline: unknown };
