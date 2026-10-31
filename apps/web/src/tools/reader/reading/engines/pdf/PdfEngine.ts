import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { EventBus, PDFLinkService, PDFViewer } from "pdfjs-dist/legacy/web/pdf_viewer.mjs";
import { normalizeText, toCodePointIndex, type Locator } from "../../locator";
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
  ViewportRect,
} from "../types";
import { mergeLineRects, quadBounds, rectToQuad } from "./geometry";
import { installStreamIteration } from "./polyfills";

export const PDFJS_VERSION = "6.4.299";
const ENGINE = `pdfjs-${PDFJS_VERSION}`;
const SEARCH_ID = "__search__";

/** A page view as the viewer exposes it (its type is `any` in the published declarations). */
type PageView = {
  id: number;
  div: HTMLDivElement;
  viewport: {
    convertToPdfPoint(x: number, y: number): number[];
    convertToViewportPoint(x: number, y: number): number[];
  };
  textLayer?: { div: HTMLDivElement } | null;
};

type OutlineNode = { title: string; dest: unknown; items?: OutlineNode[] };

/**
 * PDF books through PDF.js's own viewer components (the ones Firefox uses): a DOM text layer for
 * selection, only visible pages rendered and older ones evicted, phone canvas caps, outline,
 * links, printed page labels, and loading over HTTP ranges. Highlights are drawn in our own layer
 * per page from quads in PDF user space, which do not change with zoom; a highlight without quads
 * is found by its quote once the page's text layer exists.
 */
export class PdfEngine implements ReaderEngine {
  readonly format = "pdf" as const;
  private loadingTask: PDFDocumentLoadingTask | null = null;
  private doc: PDFDocumentProxy | null = null;
  private viewer: PDFViewer | null = null;
  private eventBus: EventBus | null = null;
  private linkService: PDFLinkService | null = null;
  private container: HTMLElement | null = null;
  private highlights: HighlightItem[] = [];
  private searchMark: HighlightItem | null = null;
  private toc: (TocItem & { page?: number })[] = [];
  private textIndexes = new Map<number, TextIndex>();
  private cleanups: (() => void)[] = [];
  private searchToken = 0;
  private relocateTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly source: BookSource,
    private readonly events: EngineEvents,
  ) {}

  async open(container: HTMLElement, start: Locator | null, preferences: ReaderPreferences): Promise<OpenedBook> {
    this.container = container;
    installStreamIteration();
    // the legacy build: PDF.js supports Safari only there (the modern one failed to search in WebKit)
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const { EventBus, PDFLinkService, PDFViewer, LinkTarget } = await import("pdfjs-dist/legacy/web/pdf_viewer.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf-worker/pdf.worker.min.mjs";

    // PDFViewer wants an absolutely positioned scroll container with a .pdfViewer child
    container.classList.add("wb-pdf");
    const inner = document.createElement("div");
    inner.className = "pdfViewer";
    container.replaceChildren(inner);

    const eventBus = new EventBus();
    const linkService = new PDFLinkService({ eventBus, externalLinkTarget: LinkTarget.BLANK, externalLinkRel: "noopener noreferrer nofollow" });
    const viewer = new PDFViewer({
      container: container as HTMLDivElement,
      viewer: inner,
      eventBus,
      linkService,
      textLayerMode: 1,
      removePageBorders: true,
    });
    linkService.setViewer(viewer);
    this.eventBus = eventBus;
    this.linkService = linkService;
    this.viewer = viewer;

    this.loadingTask = pdfjs.getDocument({
      url: this.source.fileUrl,
      // load what is shown: 256 KiB ranges, no background download of the rest
      rangeChunkSize: 262144,
      disableAutoFetch: true,
      disableStream: true,
      cMapUrl: "/pdfjs/cmaps/",
      cMapPacked: true,
      standardFontDataUrl: "/pdfjs/standard_fonts/",
      wasmUrl: "/pdfjs/wasm/",
      iccUrl: "/pdfjs/iccs/",
      enableXfa: false,
    });
    const doc = await this.loadingTask.promise;
    this.doc = doc;

    const pagesInit = new Promise<void>((resolve) => eventBus.on("pagesinit", () => resolve(), { once: true }));
    viewer.setDocument(doc);
    linkService.setDocument(doc, null);
    const labels = await doc.getPageLabels().catch(() => null);
    if (labels && labels.some((label, i) => label !== String(i + 1))) viewer.setPageLabels(labels);
    await pagesInit;
    this.setPreferences(preferences);

    eventBus.on("pagerendered", ({ pageNumber }: { pageNumber: number }) => this.drawPage(pageNumber - 1));
    eventBus.on("textlayerrendered", ({ pageNumber }: { pageNumber: number }) => {
      this.textIndexes.delete(pageNumber - 1);
      this.drawPage(pageNumber - 1);
    });
    eventBus.on("pagechanging", () => this.scheduleRelocate());
    eventBus.on("updateviewarea", () => this.scheduleRelocate());
    this.listenForSelection(container);

    this.toc = await this.readOutline(doc);
    if (start) await this.goTo(start);
    this.scheduleRelocate();
    return { toc: this.toc, total: doc.numPages, unit: "page" };
  }

  // ---- navigation ----------------------------------------------------------------------------

  async goTo(target: Locator | TocItem): Promise<void> {
    const viewer = this.viewer;
    if (!viewer || !this.doc) return;
    if ("v" in target) {
      if (typeof target.page !== "number") {
        if (typeof target.totalProgression === "number") await this.goToPercent(target.totalProgression * 100);
        return;
      }
      const pageNumber = Math.min(this.doc.numPages, target.page + 1);
      const top = target.quads?.length ? quadBounds(target.quads).top + 24 : null;
      viewer.scrollPageIntoView(
        top === null ? { pageNumber } : { pageNumber, destArray: [null, { name: "XYZ" }, null, top, null] },
      );
      return;
    }
    if (target.target) await this.linkService?.goToDestination(target.target as string | unknown[]);
  }

  async goToPercent(percent: number): Promise<void> {
    if (!this.viewer || !this.doc) return;
    const page = Math.round((Math.max(0, Math.min(100, percent)) / 100) * (this.doc.numPages - 1));
    this.viewer.currentPageNumber = page + 1;
  }

  async next(): Promise<void> {
    this.viewer?.nextPage();
  }

  async prev(): Promise<void> {
    this.viewer?.previousPage();
  }

  private scheduleRelocate(): void {
    if (this.relocateTimer) clearTimeout(this.relocateTimer);
    this.relocateTimer = setTimeout(() => this.relocate(), 150);
  }

  private relocate(): void {
    const viewer = this.viewer;
    const doc = this.doc;
    if (!viewer || !doc) return;
    const index = viewer.currentPageNumber - 1;
    const pageLabel = viewer.currentPageLabel ?? undefined;
    const total = doc.numPages;
    const locator: Locator = {
      v: 2,
      format: "pdf",
      page: index,
      ...(pageLabel ? { pageLabel } : {}),
      totalProgression: total > 1 ? index / (total - 1) : 0,
      engine: ENGINE,
    };
    const tocItem = [...this.toc].reverse().find((item) => item.page !== undefined && item.page <= index);
    this.events.onRelocate({
      locator,
      percent: Math.round((locator.totalProgression ?? 0) * 100),
      label: pageLabel && pageLabel !== String(index + 1) ? `${pageLabel} · ${index + 1} / ${total}` : `${index + 1} / ${total}`,
      tocLabel: tocItem?.label,
    });
  }

  private async readOutline(doc: PDFDocumentProxy): Promise<(TocItem & { page?: number })[]> {
    const outline = ((await doc.getOutline().catch(() => null)) ?? []) as OutlineNode[];
    const items: (TocItem & { page?: number })[] = [];
    const walk = (nodes: OutlineNode[], level: number) => {
      for (const node of nodes) {
        items.push({ id: `toc-${items.length}`, label: node.title, level, target: node.dest });
        if (node.items?.length) walk(node.items, level + 1);
      }
    };
    walk(outline, 0);
    // No page lookup per entry: on a file that is not linearized, getPageIndex for every entry loads
    // page objects spread over the whole file (a 1,000-page book was fetched entirely). The chapter
    // name in the bottom bar stays empty for PDFs until the server's structure provides it.
    return items;
  }

  // ---- selection -----------------------------------------------------------------------------

  private listenForSelection(container: HTMLElement): void {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const report = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => this.reportSelection(), 120);
    };
    const onClick = (event: MouseEvent) => this.hitTest(event);
    document.addEventListener("selectionchange", report);
    container.addEventListener("pointerup", report);
    container.addEventListener("click", onClick);
    this.cleanups.push(() => {
      document.removeEventListener("selectionchange", report);
      container.removeEventListener("pointerup", report);
      container.removeEventListener("click", onClick);
      if (timer) clearTimeout(timer);
    });
  }

  private reportSelection(): void {
    const selection = document.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0 || !this.container) {
      this.events.onSelection(null);
      return;
    }
    const range = selection.getRangeAt(0);
    if (!this.container.contains(range.commonAncestorContainer)) return;
    const locator = this.locatorForRange(range);
    if (!locator) {
      this.events.onSelection(null);
      return;
    }
    const box = range.getBoundingClientRect();
    this.events.onSelection({
      locator,
      text: range.toString(),
      rect: { x: box.left, y: box.top, width: box.width, height: box.height },
    });
  }

  /** Page, quads (per page), quote and position of a selection in the text layer. */
  private locatorForRange(range: Range): Locator | null {
    const viewer = this.viewer;
    if (!viewer) return null;
    const startPage = closestPage(range.startContainer);
    if (startPage === null) return null;
    const perPage = new Map<number, number[][]>();
    for (const rect of mergeLineRects(Array.from(range.getClientRects()))) {
      const page = this.pageAt(rect.left + rect.width / 2, rect.top + rect.height / 2);
      if (page === null) continue;
      const view = viewer.getPageView(page) as PageView;
      const layer = view.textLayer?.div ?? view.div;
      const origin = layer.getBoundingClientRect();
      const quad = rectToQuad(view.viewport, rect, origin);
      perPage.set(page, [...(perPage.get(page) ?? []), quad]);
    }
    const quads = perPage.get(startPage);
    if (!quads?.length) return null;

    const index = this.textIndex(startPage);
    const described = index ? describeRange(index, clampToPage(range, index)) : null;
    const text = described?.quote ?? { exact: normalizeText(range.toString()).trim() };
    if (!text.exact) return null;
    const label = (viewer.getPageView(startPage) as PageView & { pageLabel?: string | null }).pageLabel ?? undefined;
    return {
      v: 2,
      format: "pdf",
      page: startPage,
      ...(label ? { pageLabel: label } : {}),
      quads,
      ...([...perPage.keys()].some((p) => p !== startPage)
        ? { continuation: [...perPage.entries()].filter(([p]) => p !== startPage).map(([page, q]) => ({ page, quads: q })) }
        : {}),
      quote: text,
      ...(described ? { position: described.position, progression: described.progression } : {}),
      totalProgression: this.doc && this.doc.numPages > 1 ? startPage / (this.doc.numPages - 1) : 0,
      engine: ENGINE,
    };
  }

  private pageAt(x: number, y: number): number | null {
    const el = document.elementFromPoint(x, y);
    const page = el ? closestPage(el) : null;
    if (page !== null) return page;
    // the point is on a gap; find the page whose box contains it
    const viewer = this.viewer;
    if (!viewer) return null;
    for (let i = 0; i < viewer.pagesCount; i += 1) {
      const box = (viewer.getPageView(i) as PageView).div.getBoundingClientRect();
      if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) return i;
    }
    return null;
  }

  clearSelection(): void {
    document.getSelection()?.removeAllRanges();
  }

  private textIndex(page: number): TextIndex | null {
    const cached = this.textIndexes.get(page);
    if (cached) return cached;
    const view = this.viewer?.getPageView(page) as PageView | undefined;
    const layer = view?.textLayer?.div;
    if (!layer || !layer.childNodes.length) return null;
    const index = indexText(layer);
    this.textIndexes.set(page, index);
    return index;
  }

  // ---- highlights ----------------------------------------------------------------------------

  setHighlights(items: HighlightItem[]): void {
    this.highlights = items;
    const viewer = this.viewer;
    if (!viewer) return;
    for (let i = 0; i < viewer.pagesCount; i += 1) this.drawPage(i);
  }

  private itemsOnPage(page: number): { item: HighlightItem; quads: number[][] | null }[] {
    const list = this.searchMark ? [...this.highlights, this.searchMark] : this.highlights;
    const out: { item: HighlightItem; quads: number[][] | null }[] = [];
    for (const item of list) {
      const loc = item.locator;
      if (loc.page === page) out.push({ item, quads: loc.quads?.length ? loc.quads : null });
      for (const c of loc.continuation ?? []) if (c.page === page) out.push({ item, quads: c.quads });
    }
    return out;
  }

  /** (Re)draws the highlight layer of one page; finds quote-only highlights once its text exists. */
  private drawPage(page: number): void {
    const view = this.viewer?.getPageView(page) as PageView | undefined;
    if (!view?.div) return;
    view.div.querySelector(":scope > .wb-highlights")?.remove();
    const items = this.itemsOnPage(page);
    if (items.length === 0) return;
    const layer = document.createElement("div");
    layer.className = "wb-highlights";
    for (const { item, quads: known } of items) {
      let quads = known;
      if (!quads) {
        quads = this.findQuads(page, item.locator);
        if (!quads) continue;
        if (item.id !== SEARCH_ID) this.events.onAnchorUpdate?.(item.id, { ...item.locator, quads, engine: ENGINE });
        item.locator = { ...item.locator, quads };
      }
      for (const quad of quads) {
        // PDF.js 6 has point conversions only: the two corners of the quad's box
        const [left, bottom, right, top] = quadBoundsArray(quad);
        const [x1, y1] = view.viewport.convertToViewportPoint(left, top);
        const [x2, y2] = view.viewport.convertToViewportPoint(right, bottom);
        const mark = document.createElement("div");
        mark.className = item.id === SEARCH_ID ? "wb-hl wb-hl-search" : "wb-hl";
        mark.dataset.id = item.id;
        mark.style.left = `${Math.min(x1, x2)}px`;
        mark.style.top = `${Math.min(y1, y2)}px`;
        mark.style.width = `${Math.abs(x2 - x1)}px`;
        mark.style.height = `${Math.abs(y2 - y1)}px`;
        mark.style.backgroundColor = item.color;
        layer.append(mark);
      }
    }
    const textLayer = view.textLayer?.div;
    if (textLayer && textLayer.parentElement === view.div) view.div.insertBefore(layer, textLayer);
    else view.div.append(layer);
  }

  /** Quads for a highlight known only by its quote, from the page's text layer. */
  private findQuads(page: number, locator: Locator): number[][] | null {
    if (!locator.quote) return null;
    const index = this.textIndex(page);
    const view = this.viewer?.getPageView(page) as PageView | undefined;
    if (!index || !view?.textLayer) return null;
    const found = quoteToRange(index, locator.quote, locator.position?.start);
    if (!found) return null;
    const origin = view.textLayer.div.getBoundingClientRect();
    return mergeLineRects(Array.from(found.range.getClientRects())).map((rect) => rectToQuad(view.viewport, rect, origin));
  }

  private hitTest(event: MouseEvent): void {
    const selection = document.getSelection();
    if (selection && !selection.isCollapsed) return;
    const marks = document.querySelectorAll<HTMLElement>(".wb-pdf .wb-hl:not(.wb-hl-search)");
    for (const mark of Array.from(marks)) {
      const box = mark.getBoundingClientRect();
      if (event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom) {
        const rect: ViewportRect = { x: box.left, y: box.top, width: box.width, height: box.height };
        this.events.onHighlightClick(mark.dataset.id ?? "", rect);
        return;
      }
    }
  }

  // ---- search --------------------------------------------------------------------------------

  async *search(query: string): AsyncGenerator<SearchHit> {
    const doc = this.doc;
    const needle = normalizeText(query).trim().toLowerCase();
    if (!doc || needle.length < 2) return;
    const token = ++this.searchToken;
    let hits = 0;
    for (let i = 0; i < doc.numPages && hits < 500; i += 1) {
      if (token !== this.searchToken) return;
      const page = await doc.getPage(i + 1);
      const content = await page.getTextContent();
      const text = normalizeText(
        content.items.map((item) => ("str" in item ? item.str + (item.hasEOL ? " " : "") : "")).join(""),
      );
      const lower = text.toLowerCase();
      for (let at = lower.indexOf(needle); at !== -1 && hits < 500; at = lower.indexOf(needle, at + needle.length)) {
        hits += 1;
        const exact = text.slice(at, at + needle.length);
        yield {
          locator: {
            v: 2,
            format: "pdf",
            page: i,
            quote: { exact, prefix: text.slice(Math.max(0, at - 32), at), suffix: text.slice(at + needle.length, at + needle.length + 32) },
            position: { start: toCodePointIndex(text, at), end: toCodePointIndex(text, at + needle.length) },
          },
          excerpt: { pre: text.slice(Math.max(0, at - 40), at), match: exact, post: text.slice(at + needle.length, at + needle.length + 40) },
          label: (this.viewer?.getPageView(i) as PageView & { pageLabel?: string | null })?.pageLabel ?? String(i + 1),
        };
      }
    }
  }

  /** Shows a search hit: the page, and the hit marked until the search is cleared. */
  async showSearchHit(hit: SearchHit): Promise<void> {
    this.searchMark = { id: SEARCH_ID, locator: { ...hit.locator }, color: "rgba(255, 170, 0, 0.45)" };
    await this.goTo(hit.locator);
    if (typeof hit.locator.page === "number") this.drawPage(hit.locator.page);
  }

  clearSearch(): void {
    this.searchToken += 1;
    const page = this.searchMark?.locator.page;
    this.searchMark = null;
    if (typeof page === "number") this.drawPage(page);
  }

  // ---- preferences, teardown -----------------------------------------------------------------

  setPreferences(preferences: ReaderPreferences): void {
    const viewer = this.viewer;
    const container = this.container;
    if (!viewer || !container) return;
    if (preferences.zoom === "page-width") viewer.currentScaleValue = "page-width";
    else viewer.currentScale = preferences.zoom;
    container.dataset.theme = preferences.theme;
  }

  /** The current scale, for zoom controls. */
  get scale(): number {
    return this.viewer?.currentScale ?? 1;
  }

  destroy(): void {
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    if (this.relocateTimer) clearTimeout(this.relocateTimer);
    this.searchToken += 1;
    try {
      this.viewer?.setDocument(null as unknown as PDFDocumentProxy);
      this.linkService?.setDocument(null as unknown as PDFDocumentProxy, null);
    } catch {
      /* already torn down */
    }
    void this.loadingTask?.destroy();
    this.loadingTask = null;
    this.doc = null;
    this.viewer = null;
    this.container?.replaceChildren();
    this.container?.classList.remove("wb-pdf");
    this.container = null;
    this.textIndexes.clear();
  }
}

function closestPage(node: Node): number | null {
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  const page = el?.closest<HTMLElement>(".page[data-page-number]");
  return page ? Number(page.dataset.pageNumber) - 1 : null;
}

/** The part of a range inside one page's text layer (a selection may run onto the next page). */
function clampToPage(range: Range, index: TextIndex): Range {
  const last = index.nodes[index.nodes.length - 1]?.node;
  if (!last) return range;
  const clamped = range.cloneRange();
  if (!last.parentElement?.closest(".textLayer")?.contains(range.endContainer)) clamped.setEnd(last, last.data.length);
  return clamped;
}

function quadBoundsArray(quad: number[]): number[] {
  const xs = [quad[0], quad[2], quad[4], quad[6]];
  const ys = [quad[1], quad[3], quad[5], quad[7]];
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
