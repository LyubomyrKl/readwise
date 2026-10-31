import { normalizeText, type Locator } from "../../locator";
import { describeRange, indexText, quoteToRange, type TextIndex } from "../domText";
import type {
  BookSource,
  EngineEvents,
  HighlightItem,
  OpenedBook,
  ReaderEngine,
  ReaderPreferences,
  SearchHit,
  TocItem,
} from "../types";
import { sanitizeBookDocument } from "../../sanitizeBook";
import { loadRendition } from "./rendition";
import type { FoliateBook, FoliateRelocate, FoliateTocItem, FoliateView, OverlayerStatic } from "./foliate";

export const FOLIATE_COMMIT = "78914ae";
const ENGINE = `foliate-${FOLIATE_COMMIT}`;

const THEMES = {
  light: { fg: "#1f1f1f", link: "#1a5fb4" },
  sepia: { fg: "#3b2f20", link: "#7a4b12" },
  dark: { fg: "#e3e3e3", link: "#8cb4ff" },
} as const;

/**
 * Reflowable books (EPUB now; MOBI, AZW3, FB2 and CBZ are formats foliate-js reads as well)
 * through the vendored foliate-js (src/vendor/foliate-js): CSS-column pagination or scrolling,
 * a table of contents, progress from section sizes (the same "location N of M" on every device),
 * search, and highlights drawn by its SVG overlayer. Book content is sanitized on the way in
 * (scripts refused, the rest through sanitizeBookDocument), and the reader page's CSP blocks
 * scripts in the book frames anyway. Positions and highlights are Locator v2: the CFI is a
 * cache, verified against the stored quote and found again by it when it no longer fits.
 */
export class ReflowEngine implements ReaderEngine {
  readonly format = "epub" as const;
  private view: FoliateView | null = null;
  private container: HTMLElement | null = null;
  private book: FoliateBook | null = null;
  private overlayer: OverlayerStatic | null = null;
  private highlights = new Map<string, HighlightItem>();
  /** highlight id -> the CFI it is drawn under */
  private drawn = new Map<string, string>();
  private byCfi = new Map<string, string>();
  private indexes = new Map<number, TextIndex>();
  private preferences: ReaderPreferences | null = null;
  private selectionTimer: ReturnType<typeof setTimeout> | null = null;
  private searching = false;

  constructor(
    private readonly source: BookSource,
    private readonly events: EngineEvents,
  ) {}

  async open(container: HTMLElement, start: Locator | null, preferences: ReaderPreferences): Promise<OpenedBook> {
    const viewModule = (await import("@/src/vendor/foliate-js/view.js")) as unknown as {
      makeBook: (file: File) => Promise<FoliateBook>;
    };
    const { Overlayer } = (await import("@/src/vendor/foliate-js/overlayer.js")) as unknown as { Overlayer: OverlayerStatic };
    this.overlayer = Overlayer;

    const book = this.source.renditionUrl
      ? await loadRendition(this.source.renditionUrl)
      : await viewModule.makeBook(await this.fetchFile());
    this.guard(book);
    this.book = book;

    this.container = container;
    const view = document.createElement("foliate-view") as FoliateView;
    view.style.display = "block";
    view.style.width = "100%";
    view.style.height = "100%";
    container.replaceChildren(view);
    this.view = view;

    view.addEventListener("load", (e) => this.onLoad(e.detail.doc, e.detail.index));
    view.addEventListener("relocate", (e) => this.onRelocate(e.detail));
    view.addEventListener("create-overlay", (e) => this.drawSection(e.detail.index));
    view.addEventListener("draw-annotation", (e) => {
      const { draw, annotation } = e.detail;
      draw(this.overlayer!.highlight, { color: annotation.color });
    });
    view.addEventListener("show-annotation", (e) => this.onShowAnnotation(e.detail.value, e.detail.range));

    await view.open(book);
    this.setPreferences(preferences);
    const cfi = start?.cfi;
    await view.init({ lastLocation: cfi ?? null, showTextStart: !start });
    if (start && !cfi) await this.goTo(start);

    return {
      toc: flattenToc(book.toc ?? []),
      total: book.sections.reduce((sum, s) => sum + Math.ceil((s.linear === "no" ? 0 : s.size ?? 0) / 1500), 0),
      unit: "location",
    };
  }

  private async fetchFile(): Promise<File> {
    const response = await fetch(this.source.fileUrl, { credentials: "same-origin" });
    if (!response.ok) throw new Error(`The book could not be downloaded (${response.status})`);
    return new File([await response.blob()], "book.epub", { type: this.source.mime || "application/epub+zip" });
  }

  /** No script in a book loads; every document and SVG goes through the sanitizer. */
  private guard(book: FoliateBook): void {
    const target = book.transformTarget;
    if (!target) return;
    target.addEventListener("load", (e: Event) => {
      const detail = (e as CustomEvent<{ isScript: boolean; allow: boolean }>).detail;
      if (detail.isScript) detail.allow = false;
    });
    target.addEventListener("data", (e: Event) => {
      const detail = (e as CustomEvent<{ data: unknown; type: string }>).detail;
      const type = String(detail.type);
      if (!/^(application\/xhtml\+xml|text\/html|image\/svg\+xml)/.test(type)) return;
      detail.data = Promise.resolve(detail.data).then((data) => (typeof data === "string" ? sanitizeMarkup(data, type) : data));
    });
  }

  // ---- navigation ----------------------------------------------------------------------------

  async goTo(target: Locator | TocItem): Promise<void> {
    const view = this.view;
    if (!view) return;
    if (!("v" in target)) {
      if (typeof target.target === "string") await view.goTo(target.target);
      return;
    }
    if (target.cfi) {
      await view.goTo(target.cfi);
      return;
    }
    const index = target.href ? this.sectionIndex(target.href) : -1;
    if (index >= 0) {
      await view.goTo(index);
      if (target.quote) {
        const doc = this.docOf(index);
        const found = doc ? quoteToRange(this.textIndex(index, doc), target.quote, target.position?.start) : null;
        if (found) await view.goTo(view.getCFI(index, found.range));
      }
      return;
    }
    if (typeof target.totalProgression === "number") await view.goToFraction(target.totalProgression);
  }

  async goToPercent(percent: number): Promise<void> {
    await this.view?.goToFraction(Math.max(0, Math.min(100, percent)) / 100);
  }

  async next(): Promise<void> {
    await this.view?.next();
  }

  async prev(): Promise<void> {
    await this.view?.prev();
  }

  private onRelocate(detail: FoliateRelocate): void {
    const view = this.view;
    const book = this.book;
    if (!view || !book) return;
    const index = detail.range ? this.indexOfDoc(detail.range.startContainer.ownerDocument) : -1;
    const href = index >= 0 ? book.sections[index]?.id : undefined;
    let quote: Locator["quote"];
    if (detail.range && index >= 0) {
      // the text the view starts with, to find the place again if the CFI ever stops fitting
      const doc = detail.range.startContainer.ownerDocument;
      if (doc) {
        const tail = doc.createRange();
        tail.setStart(detail.range.startContainer, detail.range.startOffset);
        tail.setEnd(detail.range.endContainer, detail.range.endOffset);
        const exact = normalizeText(tail.toString()).trim().slice(0, 60);
        if (exact) quote = { exact };
      }
    }
    const locator: Locator = {
      v: 2,
      format: "epub",
      ...(href ? { href } : {}),
      ...(detail.cfi ? { cfi: detail.cfi } : {}),
      ...(quote ? { quote } : {}),
      totalProgression: clamp01(detail.fraction ?? 0),
      engine: ENGINE,
    };
    const location = detail.location;
    const page = detail.pageItem?.label;
    this.events.onRelocate({
      locator,
      percent: Math.round(clamp01(detail.fraction ?? 0) * 100),
      label: page
        ? `p. ${page}`
        : location
          ? `${(location.current ?? 0) + 1} / ${location.total ?? 0}`
          : `${Math.round(clamp01(detail.fraction ?? 0) * 100)}%`,
      tocLabel: detail.tocItem?.label?.trim(),
    });
  }

  // ---- loaded sections: selection, keys, text ------------------------------------------------

  private onLoad(doc: Document, index: number): void {
    this.indexes.delete(index);
    const report = () => {
      if (this.selectionTimer) clearTimeout(this.selectionTimer);
      this.selectionTimer = setTimeout(() => this.reportSelection(doc, index), 150);
    };
    doc.addEventListener("selectionchange", report);
    doc.addEventListener("pointerup", report);
    doc.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" || event.key === "PageDown") void this.next();
      if (event.key === "ArrowLeft" || event.key === "PageUp") void this.prev();
    });
  }

  private reportSelection(doc: Document, index: number): void {
    const selection = doc.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      this.events.onSelection(null);
      return;
    }
    const range = selection.getRangeAt(0);
    const locator = this.locatorForRange(doc, index, range);
    if (!locator) {
      this.events.onSelection(null);
      return;
    }
    const box = range.getBoundingClientRect();
    const frame = doc.defaultView?.frameElement?.getBoundingClientRect();
    this.events.onSelection({
      locator,
      text: range.toString(),
      rect: { x: box.left + (frame?.left ?? 0), y: box.top + (frame?.top ?? 0), width: box.width, height: box.height },
    });
  }

  private locatorForRange(doc: Document, index: number, range: Range): Locator | null {
    const view = this.view;
    const book = this.book;
    if (!view || !book) return null;
    const described = describeRange(this.textIndex(index, doc), range);
    if (!described) return null;
    const blocks = [blockId(range.startContainer), blockId(range.endContainer)].filter((b): b is string => !!b);
    const fractions = view.getSectionFractions?.() ?? [];
    const sectionStart = fractions[index] ?? 0;
    const sectionEnd = fractions[index + 1] ?? 1;
    return {
      v: 2,
      format: "epub",
      href: book.sections[index]?.id,
      ...(blocks.length ? { blocks: blocks.length === 2 && blocks[0] === blocks[1] ? [blocks[0]] : blocks } : {}),
      cfi: view.getCFI(index, range),
      quote: described.quote,
      position: described.position,
      progression: described.progression,
      totalProgression: clamp01(sectionStart + described.progression * (sectionEnd - sectionStart)),
      engine: ENGINE,
    };
  }

  clearSelection(): void {
    for (const { doc } of this.view?.renderer?.getContents?.() ?? []) doc?.getSelection()?.removeAllRanges();
  }

  private textIndex(index: number, doc: Document): TextIndex {
    const cached = this.indexes.get(index);
    if (cached) return cached;
    const built = indexText(doc.body ?? doc.documentElement);
    this.indexes.set(index, built);
    return built;
  }

  private docOf(index: number): Document | null {
    return this.view?.renderer?.getContents?.().find((c) => c.index === index)?.doc ?? null;
  }

  private indexOfDoc(doc: Document | null): number {
    if (!doc) return -1;
    return this.view?.renderer?.getContents?.().find((c) => c.doc === doc)?.index ?? -1;
  }

  private sectionIndex(href: string): number {
    return this.book?.sections.findIndex((s) => s.id === href) ?? -1;
  }

  // ---- highlights ----------------------------------------------------------------------------

  setHighlights(items: HighlightItem[]): void {
    const next = new Map(items.map((item) => [item.id, item]));
    for (const [id, cfi] of this.drawn) {
      const item = next.get(id);
      const prev = this.highlights.get(id);
      if (!item || item.color !== prev?.color || item.locator.cfi !== prev?.locator.cfi) {
        void this.view?.deleteAnnotation({ value: cfi });
        this.drawn.delete(id);
        this.byCfi.delete(cfi);
      }
    }
    this.highlights = next;
    this.reportDrawn();
    for (const content of this.view?.renderer?.getContents?.() ?? []) this.drawSection(content.index);
  }

  /** Draws the highlights of a loaded section, finding by its quote any whose CFI no longer fits. */
  private drawSection(index: number): void {
    const view = this.view;
    const doc = this.docOf(index);
    if (!view || !doc || !this.book) return;
    const href = this.book.sections[index]?.id;
    for (const item of this.highlights.values()) {
      if (this.drawn.has(item.id)) continue;
      const loc = item.locator;
      let cfi = loc.cfi;
      let resolvedIndex = -1;
      if (cfi) {
        try {
          resolvedIndex = view.resolveNavigation(cfi)?.index ?? -1;
        } catch {
          resolvedIndex = -1;
        }
      }
      const belongsHere = resolvedIndex === index || (resolvedIndex < 0 && loc.href === href);
      if (!belongsHere) continue;
      if (!cfi || !this.fits(index, doc, cfi, loc)) {
        if (!loc.quote) continue;
        const found = quoteToRange(this.textIndex(index, doc), loc.quote, loc.position?.start);
        if (!found) continue;
        cfi = view.getCFI(index, found.range);
        item.locator = { ...loc, cfi, href, engine: ENGINE };
        this.events.onAnchorUpdate?.(item.id, item.locator);
      }
      this.drawn.set(item.id, cfi);
      this.byCfi.set(cfi, item.id);
      void view.addAnnotation({ value: cfi, color: item.color });
    }
    this.reportDrawn();
  }

  /** How many highlights are on the page: foliate draws them in a closed shadow root, out of reach of tests. */
  private reportDrawn(): void {
    if (this.container) this.container.dataset.highlightsDrawn = String(this.drawn.size);
  }

  /** Whether a CFI still points at the stored quote. */
  private fits(index: number, doc: Document, cfi: string, loc: Locator): boolean {
    if (!loc.quote) return true;
    try {
      const resolved = this.view?.resolveNavigation(cfi);
      const range = resolved?.anchor?.(doc);
      if (!range || typeof (range as Range).toString !== "function") return false;
      return normalizeText((range as Range).toString()).trim() === normalizeText(loc.quote.exact).trim();
    } catch {
      return false;
    }
  }

  private onShowAnnotation(value: string, range: Range | null): void {
    const id = this.byCfi.get(value);
    if (!id) return;
    const box = range?.getBoundingClientRect();
    const frame = range?.startContainer.ownerDocument?.defaultView?.frameElement?.getBoundingClientRect();
    this.events.onHighlightClick(
      id,
      box ? { x: box.left + (frame?.left ?? 0), y: box.top + (frame?.top ?? 0), width: box.width, height: box.height } : null,
    );
  }

  // ---- search --------------------------------------------------------------------------------

  async *search(query: string): AsyncGenerator<SearchHit> {
    const view = this.view;
    const needle = query.trim();
    if (!view || needle.length < 2) return;
    this.searching = true;
    for await (const result of view.search({ query: needle })) {
      if (!this.searching || result === "done") return;
      if (typeof result === "object" && "subitems" in result) {
        for (const sub of result.subitems ?? []) {
          yield { locator: { v: 2, format: "epub", cfi: sub.cfi }, excerpt: sub.excerpt, label: result.label };
        }
      }
    }
  }

  async showSearchHit(hit: SearchHit): Promise<void> {
    if (hit.locator.cfi) await this.view?.goTo(hit.locator.cfi);
  }

  clearSearch(): void {
    this.searching = false;
    this.view?.clearSearch();
  }

  // ---- preferences, teardown -----------------------------------------------------------------

  setPreferences(preferences: ReaderPreferences): void {
    this.preferences = preferences;
    const renderer = this.view?.renderer;
    if (!renderer) return;
    renderer.setAttribute("flow", preferences.flow);
    renderer.setAttribute("max-inline-size", "720px");
    renderer.setAttribute("max-column-count", "2");
    renderer.setAttribute("margin", "48px");
    renderer.setAttribute("gap", "6%");
    const theme = THEMES[preferences.theme];
    renderer.setStyles?.(`
      html { color-scheme: ${preferences.theme === "dark" ? "dark" : "light"}; font-size: ${Math.round(preferences.fontScale * 100)}% !important; }
      html, body { background: transparent !important; color: ${theme.fg} !important; }
      p, li, blockquote, dd, div { line-height: ${preferences.lineHeight} !important; }
      a:link, a:visited { color: ${theme.link} !important; }
      ::selection { background: rgba(255, 196, 0, 0.45); }
    `);
  }

  destroy(): void {
    if (this.selectionTimer) clearTimeout(this.selectionTimer);
    this.searching = false;
    try {
      this.view?.close();
    } catch {
      /* already closed */
    }
    this.view?.remove();
    this.view = null;
    this.container = null;
    this.book = null;
    this.indexes.clear();
    this.drawn.clear();
    this.byCfi.clear();
  }
}

function flattenToc(items: FoliateTocItem[], level = 0, out: TocItem[] = []): TocItem[] {
  for (const item of items) {
    out.push({ id: `toc-${out.length}`, label: (item.label ?? "").trim() || "Untitled", level, target: item.href });
    if (item.subitems?.length) flattenToc(item.subitems, level + 1, out);
  }
  return out;
}

function blockId(node: Node): string | null {
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return el?.closest("[data-wb-b]")?.getAttribute("data-wb-b") ?? null;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** A book document or SVG, sanitized, serialized the way it was parsed. */
function sanitizeMarkup(text: string, type: string): string {
  const mime = type.startsWith("image/svg") ? "image/svg+xml" : type.startsWith("text/html") ? "text/html" : "application/xhtml+xml";
  const doc = new DOMParser().parseFromString(text, mime as DOMParserSupportedType);
  if (doc.getElementsByTagName("parsererror").length > 0) return text;
  sanitizeBookDocument(doc);
  return mime === "text/html" ? `<!DOCTYPE html>${doc.documentElement.outerHTML}` : new XMLSerializer().serializeToString(doc);
}
