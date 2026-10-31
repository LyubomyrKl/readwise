# Document readers: investigation and plan

Date: 2026-10-31. Scope: how Workbench renders PDF and EPUB books in the browser, how the workers
understand them for the edition pipeline, and how the two are tied together. The living
engineering guide that follows from this is [`document-architecture.md`](document-architecture.md);
this file keeps the evidence and the reasoning.

Method: the code was read end to end (web readers, upload, API documents and reading modules, the
worker ingest); four research tracks covered browser PDF rendering, browser EPUB rendering, server
document understanding, and reading-system architecture, from primary sources (repositories,
releases, specifications, source files). Claims nobody could verify are marked **UNVERIFIED**.

## 1. The current implementation

### 1.1 What there is

| Part | Where | What it does |
|---|---|---|
| PDF reader | `apps/web/src/tools/reader/reading/PDFReader.tsx` (652 lines) | EmbedPDF 1.5 (PDFium compiled to WASM) with the loader, viewport, scroll, render and zoom plugins; custom pinch gestures (`usePdfGestures.ts`, 281 lines) |
| EPUB reader | `reading/EPUBReader.tsx` (613 lines) | epub.js 0.3.93 through react-reader 2.0.13; highlights as CFI ranges; font size; table of contents |
| Upload metadata | `documents/bookParser.ts` | PDF.js and epub.js in the browser read title, author, page count and cover before the upload |
| Position, highlights, notes | `useReadingSession.ts`, `useHighlights.ts`, `useNotes.ts`; API `reading/*` | position `{type, page?, cfi?, percentage?}`; highlight anchor `{type, page?, cfi?, rects?}` plus its text; JSON columns |
| File delivery | API `document-files.service.ts` | the whole object streamed (until this work: no ranges, no caching) |
| Understanding | worker `ingest/` (PyMuPDF; BeautifulSoup over the EPUB XHTML) | the document IR per file SHA-256: blocks (`page` for PDF, `href` for EPUB), sections, figures; read by the edition engine |

### 1.2 Defects found in the code

1. **PDF: no text layer.** Pages are bitmaps; the container is `select-none`. No selection, search,
   highlights, links or outline; notes are free-floating; the position is a page number.
2. **PDF: the whole file before the first page.** `fetch` → Blob → EmbedPDF. EmbedPDF itself only
   supports whole-file loading ([docs](https://www.embedpdf.com/docs/engines/document-lifecycle/open-document-url));
   the API offered no `Range` support anyway.
3. **PDF: two engines shipped.** `pdfium.wasm` is 7.69 MB raw / 2.90 MB gzipped, and PDF.js 5.7 is
   shipped as well, only for the upload metadata.
4. **PDF: canvases up to 5x device pixels.** About 22 MB per phone page at that ceiling; PDF.js
   caps mobile canvases at 5.24 MP and re-renders only the visible area sharper
   ([app_options.js](https://github.com/mozilla/pdf.js/blob/master/web/app_options.js), [PR #19128](https://github.com/mozilla/pdf.js/pull/19128)).
5. **EPUB: progress is always 0.** `locations.percentageFromCfi` returns `null` until locations are
   generated ([locations.js](https://github.com/futurepress/epub.js/blob/master/src/locations.js)); the reader never generates
   them and maps `null` to 0, so the saved percentage is 0 too.
6. **"of -1" pages.** At upload an EPUB's page count is `book.locations.total` without generated
   locations: -1.
7. **EPUB: book scripts may run on the app's origin.** `allowScriptedContent: true` makes the frames
   `allow-same-origin allow-scripts`, which lets content remove its own sandbox
   ([HTML spec](https://html.spec.whatwg.org/multipage/iframe-embed-object.html#attr-iframe-sandbox));
   the only defence is a block-list sanitizer in the browser, and the app sends no CSP. The frames
   share an origin with `/api/gw`, which attaches the session, money included.
8. **EPUB engine unmaintained.** No epub.js release since 0.3.93 (2022-02-16); fixes merged in 2026
   were never published ([npm](https://www.npmjs.com/package/epubjs), [#1414](https://github.com/futurepress/epub.js/pull/1414));
   known CFI bugs ([#1358](https://github.com/futurepress/epub.js/issues/1358)).
9. **Two readers, duplicated chrome.** Separate menus, gestures, position handling and note wiring;
   nothing shared beyond the notes panel.
10. **Format-specific anchors.** A CFI or a page; no quote context, no progression, nothing the
    server's text can match. A CFI computed on a client-sanitized, HTML-reparsed DOM need not match
    the worker's XML parse (inference).
11. **Coarse provenance in the IR.** A block knows its PDF page or EPUB file, not where on the page
    or which element; no printed page labels; footnote bodies dropped; whitespace normalized, so IR
    offsets do not line up with rendered text.
12. **Uploads buffered in memory** (`multer` memory storage, up to 1 GB, in a 512 MB API container),
    and client-supplied metadata trusted (title, author, page count).
13. **Tests mock the engines.** Nothing renders a real book in a browser.

Production on 2026-10-31: 2 books, 0 highlights, 0 notes, 2 saved positions; migrating anchors is
therefore cheap now and expensive later.

## 2. Research findings

### 2.1 PDF rendering in the browser

| Option | Licence | Latest | Verdict |
|---|---|---|---|
| **PDF.js viewer components** (`pdfjs-dist/web/pdf_viewer.mjs`) | Apache-2.0 | 6.4.299, 2026-10-03 ([releases](https://github.com/mozilla/pdf.js/releases)) | **Chosen.** DOM text layer, find, outline, links, page labels, Range loading, visible-only rendering with eviction, phone canvas caps, `pageColors` |
| react-pdf | MIT | 11.0.0, 2026-09-10 | No virtualization; every mounted page renders ([FAQ](https://github.com/wojtekmaj/react-pdf/wiki/Frequently-Asked-Questions)) |
| EmbedPDF (current) | MIT / Apache-2.0 (v3) | 2.15.1; v3 in `next` | Whole-file download only ([#7](https://github.com/embedpdf/embed-pdf-viewer/issues/7), [#540](https://github.com/embedpdf/embed-pdf-viewer/issues/540)); no text selection on phones by default ([#706](https://github.com/embedpdf/embed-pdf-viewer/issues/706)); no page-label API ([#732](https://github.com/embedpdf/embed-pdf-viewer/issues/732)); iOS crash open ([#692](https://github.com/embedpdf/embed-pdf-viewer/issues/692)); v3 a rewrite "not yet recommended for production" |
| PDF Slick | MIT | 4.0.3 | A thin React wrapper around the same PDF.js components; a template, one maintainer |
| Lector | MIT | 3.16.x | Headless React over PDF.js core; still on PDF.js 5; loads all page proxies unless progressive |
| react-pdf-highlighter(-extended) | MIT | 2024 | Stale (PDF.js 4.4); useful only for its zoom-independent data model |
| MuPDF.js | AGPL / commercial | 1.28.1 | A library, no viewer; 10.4 MB WASM; AGPL over the served app |

How PDF.js behaves (read from the 6.4.299 build):
- Range loading needs `Content-Length`, `Accept-Ranges: bytes`, identity encoding and a file larger
  than two 64 KiB chunks ([network_utils.js](https://github.com/mozilla/pdf.js/blob/master/src/display/network_utils.js));
  `disableAutoFetch` (with `disableStream`) stops background prefetching.
- `PDFRenderingQueue` renders visible pages first; `PDFPageViewBuffer` keeps max(10, 2·visible+1)
  page views and resets older ones ([pdf_viewer.js](https://github.com/mozilla/pdf.js/blob/master/web/pdf_viewer.js)).
- `PDFFindController` extracts the text of every page on the first search.
- The worker still allocates one buffer the size of the file ([chunked_stream.js](https://github.com/mozilla/pdf.js/blob/master/src/core/chunked_stream.js)).
- Safari is "mostly" supported and not in the automated matrix ([FAQ](https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions)): the main risk.

Anchoring: PDF highlight annotations store `QuadPoints` in default user space; PDF.js's own
highlight editor, Zotero ([forum](https://forums.zotero.org/discussion/comment/437069)) and Nutrient
([schema](https://www.nutrient.io/guides/nodejs/json/schema/annotations.md)) store page + rectangles in
page coordinates. Hypothesis anchors in PDF.js by a document-wide text position, a quote and a page
selector, re-anchoring by fuzzy, whitespace-insensitive quote search from the nearest page
([pdf.ts](https://github.com/hypothesis/client/blob/main/src/annotator/anchoring/pdf.ts)).

No neutral benchmark of PDF.js against PDFium-WASM on large files exists (UNVERIFIED that any does);
one 2026 case study measured lower memory with EmbedPDF in WebKit
([PR](https://github.com/elijahroizman/workspace/pull/6)) but with whole-file loading and no text
layer. Our own measurements are part of the plan (section 10).

### 2.2 Reflowable rendering in the browser

| Engine | Licence | State | Verdict |
|---|---|---|---|
| epub.js + react-reader (current) | BSD-2 / ISC | last release 2022-02-16; issues unanswered ([#1406](https://github.com/futurepress/epub.js/issues/1406)) | Retire |
| **foliate-js** | MIT | no releases; last commit 2026-05-01 (`78914ae`) | **Chosen, vendored.** EPUB 2/3, MOBI/KF8/AZW3, FB2, CBZ; book interface with pluggable loaders; paginator (CSS columns, paginated or scrolled), fixed-layout renderer, SVG overlayer, search, progress from section sizes, CFI module; used by Foliate and Readest (a Next.js 16 app) |
| Readium ts-toolkit | BSD-3 | navigator 2.14.0, 2026-10-23 | Runner-up: the best specified (RWPM, Locator, Decorator), but needs a server manifest and positions, renders only EPUB of our formats, breaking changes in minors ([CHANGELOG](https://github.com/readium/ts-toolkit/blob/develop/navigator/CHANGELOG.MD)), one main developer |
| DITA Toolkit (R2D2BC) | Apache-2.0 | v3 beta | One developer since 2025 |
| Vivliostyle, Bibi | AGPL / — | — | A typesetter; abandoned |

foliate-js caveats: the README says the API "is *not* stable" and recommends a submodule; search is
"extremely slow"; Safari is not listed among supported browsers; iOS selection drag may be taken as a
swipe ([#86](https://github.com/johnfactotum/foliate-js/issues/86)); `open(url)` downloads the whole file
(our loader avoids that). Readest's fork (MIT, 267 commits ahead) carries iOS and huge-chapter fixes
([readest/foliate-js#126](https://github.com/readest/foliate-js/pull/126)) and is the first place to look
when we hit those.

All engines run book frames as `allow-same-origin allow-scripts`, because of WebKit bug 218086
(open since 2020): Safari does not deliver the parent's listeners into a sandboxed same-origin
frame without `allow-scripts` ([bug](https://bugs.webkit.org/show_bug.cgi?id=218086)). The defence is
a strict script CSP on the reader page, which `blob:` and `srcdoc` documents inherit
([policy containers](https://html.spec.whatwg.org/multipage/origin.html#policy-containers)), plus
sanitizing the content.

CSS multi-column has a ceiling: a single chapter of hundreds of kilobytes may never paint
([readest/foliate-js#126](https://github.com/readest/foliate-js/pull/126)); converted DOCX/TXT/MOBI
often produce one huge file, so sections must be split at ingest.

### 2.3 Document understanding (server side)

| Tool | Licence (code / weights) | Fit |
|---|---|---|
| **PyMuPDF** (in use; 2.0 released 2026-10-19 with pymupdf4llm and a GNN layout model) | AGPL | Stays. 2.0's layout: 0.39-0.58 s/page, 467 MB peak on 2 cores (measured in an arm64 container); classes title, section-header, list-item, caption, footnote, page-header/footer, table, picture; page + bbox per box; printed page labels via `get_page_labels()` ([PyPI](https://pypi.org/project/pymupdf/2.0/), [Artifex DocLayNet eval](https://artifex.com/blog/pymupdf-layout-performance-on-doclaynet-a-comparative-evaluation), vendor). Licence churn last year: pin |
| Docling 2.145 | MIT / Apache, CDLA | Good provenance (`page_no`, `bbox`, `charspan`), but 2.4-6.2 GB peak RSS ([report](https://arxiv.org/abs/2408.09869)): not on a 3.7 GB host |
| Marker, MinerU, olmOCR, Chandra, dots.ocr, PaddleOCR-VL, DeepSeek-OCR, GLM-OCR | various, some OpenRAIL | GPU/VLM class; candidates for the Mac, for scans |
| Surya 2.5 | Apache / OpenRAIL-M | Best published Ukrainian figure (uk 88.1%, ru 71.7%, vendor table); Mac |
| OCRmyPDF + Tesseract | MPL / Apache | CPU fallback for scans; much higher error on hard Cyrillic pages ([dataset](https://huggingface.co/datasets/metrika-labs/ru-ocr-benchmark-hard)) |
| EPUB libraries (ebooklib, pandoc, calibre, Docling, Marker, docvortex, Unstructured) | — | Each loses either the spine origin of a block or note links; **keep our own EPUB parser** and extend it |
| calibre `ebook-convert` | GPL-3 (CLI) | MOBI/AZW3 → EPUB at ingest |
| mammoth | BSD-2 | DOCX → semantic HTML |

Benchmarks cover English and Chinese (OmniDocBench) or fact presence (olmOCR-bench); none covers
printed Ukrainian books (UNVERIFIED gap): our own pages decide.

### 2.4 Reading-system architecture

- Serious readers keep **two renderer families** (reflowable HTML, fixed pages): KOReader (crengine
  vs MuPDF), foliate-js (paginator vs fixed layout); calibre converts everything to XHTML and calls
  PDF input "really, really bad" ([manual](https://manual.calibre-ebook.com/conversion.html)).
- **Positions carry redundant selectors**, tried from precise to robust and verified against a stored
  quote: the Readium Locator ([model](https://readium.org/architecture/models/locators/)), W3C Web
  Annotation selectors ([model](https://www.w3.org/TR/annotation-model/)), Hypothesis
  ([html.ts](https://github.com/hypothesis/client/blob/main/src/annotator/anchoring/html.ts),
  [match-quote.ts](https://github.com/hypothesis/client/blob/main/src/annotator/anchoring/match-quote.ts)),
  Thorium's export. The W3C EPUB Annotations draft of 2026-09-20 drops CFI entirely
  ([WD](https://www.w3.org/TR/2026/WD-epub-anno-10-20260920/)); Readium's annotation profile calls CFI
  implementations "not fully interoperable" ([readium/annotations](https://github.com/readium/annotations)).
- **Stable pages come from the file, not the screen**: Readium positions, foliate's 1,500-byte
  locations ([view.js](https://github.com/johnfactotum/foliate-js/blob/main/view.js)), the EPUB
  `page-list` for print pages ([EPUB 3.3](https://www.w3.org/TR/epub-33/#sec-nav-pagelist)).
- **Provenance is page + box + character span** (Docling's `ProvenanceItem`, Azure's
  `boundingRegions` + `spans`).
- **Stable ids in the content** make anchoring and mapping cheap: Kobo wraps sentences in `koboSpan`
  ids ([kepubify](https://github.com/pgaskin/kepubify/blob/master/kepub/transform.go)); calibre's viewer
  serves a per-book canonical rendition tagged with a book hash
  ([render_book.py](https://github.com/kovidgoyal/calibre/blob/master/src/calibre/srv/render_book.py)).

## 3. Alternatives compared

| Approach | For | Against | Verdict |
|---|---|---|---|
| A. Patch today's readers | Least work | Every defect above stays structural: no PDF text layer, an unmaintained EPUB engine, CFI-only anchors | Rejected |
| B. One universal renderer for every format (convert all to HTML, or render all as PDF) | One engine | PDF → HTML loses layout (calibre's own verdict); HTML → PDF loses reflow on phones | Rejected |
| C. One renderer per format, each with its own anchors | Simple per format | Duplicated chrome; no shared positions; mapping to the IR per format | Rejected |
| D. **Two native renderer families behind one reader shell, one locator model, one server IR with provenance, and a server rendition for reflowable books** | Faithful rendering; shared UI and anchors; exact mapping; formats added as converters | More moving parts: rendition build, CSP, vendored engine | **Chosen** |
| E. Readium end to end (Go streamer + TS navigator) | A full specification | A Go sidecar on a 3.7 GB host; EPUB only for rendering; churn | Rejected for now; the locator model stays compatible |

Why D beats E for us: foliate-js renders the reflowable formats we want later (MOBI, AZW3, FB2,
CBZ) without a server, our own rendition and manifest give us what Readium's streamer would, and
our locator follows the Readium/W3C shape, so moving later stays possible.

## 4. Recommended architecture

```
                         upload (PDF, EPUB, later DOCX/MOBI/FB2/TXT)
                                      │  books bucket, SHA-256
                                      ▼
          ┌─────────────────────── worker: reader.ingest ───────────────────────┐
          │  format adapter ─► rendition (reflowable only) ─► IR v2 (+ provenance) │
          │   PDF: PyMuPDF          sanitized XHTML with           blocks: id,      │
          │   EPUB: zip+OPF+lxml    data-wb-b block ids,           page+bbox or     │
          │   later: converters     manifest (sizes, toc)          href+block ids   │
          └───────────────┬───────────────────────┬────────────────────┬────────────┘
                          │ extractions bucket     │ renditions/<sha>/  │ ir/<sha>/
                          ▼                        ▼                    ▼
     API: /download (Range, ETag)     /rendition/<path> (immutable)    /structure, editions
                          │                        │
                          ▼                        ▼
   web reader shell ── PdfEngine (PDF.js viewer) | ReflowEngine (foliate-js) ── Locator v2
      toolbar, TOC, search, highlights, notes, settings, progress, position sync
```

Responsibilities:

- **Rendering** (client): show the original faithfully. PDF bytes untouched through PDF.js;
  reflowable books through foliate-js from the server rendition (or the original file while no
  rendition exists).
- **Understanding** (worker): the IR, built once per file hash, from the same parse that writes the
  rendition, so block ids line up by construction.
- **The map**: Locator v2 (section 6) for positions, highlights, notes and citations; IR blocks carry
  the locator parts that point back (PDF page + bbox, EPUB href + block id).
- **Security**: strict CSP on the reader route; allowlist sanitizing on the server; the client
  sanitizer as a second layer; uploads served as attachments with `nosniff`.

## 5. Data flow

1. **Upload**: the browser reads title, author, cover with the reader engines themselves (PDF.js;
   foliate-js) for the form; the API stores the file and its SHA-256 and queues `reader.ingest`.
2. **Ingest** (worker, fast queue, no LLM): per format adapter → for reflowable books the
   rendition (sanitized XHTML with block ids, CSS, images, manifest with sizes) and the IR v2 from
   the same tree; for PDF the IR v2 with page index, bbox in PDF user space and page labels. Results:
   `irStorageKey`, `renditionKey`, language.
3. **Reading**: the shell opens the engine for the book's family. PDF: `getDocument` over HTTP
   ranges. EPUB: a foliate loader that fetches `container.xml`, the OPF and chapters from
   `/reader/documents/:id/rendition/<path>`, sizes from the manifest.
4. **Selecting text** produces a Locator v2 (quote with context, position, progression, plus CFI or
   page + quads, plus block ids); it is stored with the highlight or note.
5. **Opening again** resolves each locator: the precise cache first (CFI or quads), verified by the
   quote, then position, then fuzzy quote search; a successful fallback rewrites the cache.
6. **Editions** (later phase): the abridge job writes source block ids on each edition paragraph;
   "open the original here" becomes a locator with those blocks.

## 6. Data models and interfaces

### 6.1 Locator v2 (TypeScript and Python twins)

```ts
type Locator = {
  v: 2;
  format: "pdf" | "epub";            // later: "mobi" | "fb2" | "cbz" | ...
  // reflowable
  href?: string;                      // chapter path in the rendition (same as in the EPUB)
  blocks?: string[];                  // data-wb-b ids of the first and last block covered
  cfi?: string;                       // engine cache: a CFI point or range
  // fixed layout
  page?: number;                      // 0-based page index
  pageLabel?: string;                 // printed page label ("xlii", "57")
  quads?: number[][];                 // PDF user space, 8 numbers per quad
  // every format
  quote?: { exact: string; prefix?: string; suffix?: string };   // normalized, <= 32-char context
  position?: { start: number; end: number };  // code points in the chapter's (or page's) normalized text
  progression?: number;               // 0..1 within the chapter or page
  totalProgression?: number;          // 0..1 in the book
  engine?: string;                    // which engine computed the caches ("pdfjs-6.4.299", "foliate-78914ae")
};
```

- The reading position is a Locator with `quote.exact` = about 60 characters of the text that starts
  the view.
- Normalization (shared, tested on both sides with the same fixtures): Unicode NFC, collapse
  whitespace to one space, drop soft hyphens (U+00AD), count code points.
- Fuzzy matching: approx-string-match (MIT), Hypothesis's scoring (quote 50, prefix 20, suffix 20,
  closeness 2; up to min(256, len/2) errors).
- Stored in the existing JSON columns (`reader_highlight.anchor`, `reader_note.anchor`,
  `reader_book.readingPosition`); `v: 2` tells it from v1, which is read once and upgraded.

### 6.2 Reader engine interface (web)

```ts
interface ReaderEngine {
  open(target: HTMLElement, source: BookSource, start?: Locator | null): Promise<OpenedBook>; // toc, page labels, totals
  goTo(target: Locator | TocItem | number): Promise<void>;
  next(): Promise<void>; prev(): Promise<void>;
  onRelocate(cb: (loc: Locator, progress: Progress) => void): () => void;
  onSelection(cb: (sel: TextSelection | null) => void): () => void;     // locator + client rect
  setHighlights(items: { id: string; locator: Locator; color: string }[]): void;
  search?(query: string): AsyncIterable<SearchHit>;
  setPreferences(prefs: ReaderPreferences): void;                        // theme, font size, zoom, flow
  destroy(): void;
}
```

One `ReaderShell` owns the chrome (toolbar, table of contents, search, notes and highlights panel,
settings, progress, keyboard, position sync) for every engine.

### 6.3 IR v2 (worker)

Additions to `ingest/ir.py`, backwards compatible for the edition engine:
- `Block.id` (stable within the IR; for reflowable books equal to the element's `data-wb-b`);
- PDF: `Block.page` stays 1-based for the edition engine, plus `Block.boxes`: list of
  `[page_index, x0, y0, x1, y1]` in PDF user space; `Document.page_labels`;
- EPUB: `Block.href` plus `Block.anchor` (the block id in the rendition); `Document.page_labels`
  from `page-list` / NCX `pageList` when present;
- `Document.rendition` (key, version, manifest summary).

### 6.4 Rendition (reflowable books)

`extractions/renditions/<sha256>/r1/`: the EPUB's own tree (container, OPF, XHTML, CSS, images,
fonts) after allowlist sanitizing, with `data-wb-b="<id>"` on every block element, plus
`wb-manifest.json` (`files: {path: bytes}`, `spine`, `toc`, `pageList`, builder version). Served by
`GET /reader/documents/:id/rendition/<path>` with `Cache-Control: private, max-age=31536000, immutable`,
`X-Content-Type-Options: nosniff` and `Content-Security-Policy: sandbox` (a chapter opened directly
cannot run anything on the app's origin).

## 7. Performance

| Concern | Decision |
|---|---|
| Large PDFs | HTTP ranges (done: 206, ETag, immutable cache); `disableAutoFetch` + `disableStream` for big files; PDF.js renders only visible pages and evicts others; phone canvas caps kept; no DPR above the device's |
| Large EPUBs | the rendition is fetched chapter by chapter (no whole-file download); images and fonts on demand; sections over ~300 KB split at ingest (CSS-column ceiling) |
| Progress without layout | foliate's section-size progress with sizes from the manifest: the same "location N of M" on every device |
| Search | in-book search by the engines first (PDF.js find controller; foliate search); server search over the IR later, because the find controller pulls every page's text and foliate's search is slow |
| Client vs server parsing | rendering on the client; understanding on the server, asynchronously, once per file hash; nothing re-parsed per view |
| Memory | engines destroyed on close (`loadingTask.destroy()`, `view.close()`); no blob copies of whole files once loaders are in place |
| Server | the ingest stays model-free on the 2-vCPU host; PyMuPDF 2.0 layout fits (467 MB peak) and is evaluated before adoption; OCR and layout models run on the Mac |

## 8. Migration

- Production has no highlights or notes, so anchors need no backfill; v1 positions (page or CFI)
  are read once and replaced by v2 on the next save.
- The readers are replaced, not run side by side (one user; the old engines go with this work).
- Books ingested before IR v2 are re-ingested on demand (the ingest is cheap and cached by hash);
  books without a rendition open from the original file.
- EmbedPDF, epub.js and react-reader are removed once both engines pass the browser tests; PDF.js
  becomes one pinned version for the reader and the upload.

## 9. Implementation phases

| Phase | Content | Done when |
|---|---|---|
| 1. Foundations | Range/ETag/cache (done); Locator v2, normalization and fuzzy anchoring (TS and Python); engine interface and reader shell; CSP on the reader route | unit tests on both sides with shared fixtures; CSP blocks an inline script in a book frame (browser test) |
| 2. PDF | pdfjs-dist 6.4.299 pinned; PdfEngine on `PDFViewer`; text selection, highlights (quads + quote), notes, outline, page labels, find, dark mode, range loading | a real PDF opens over ranges, highlights survive reload and zoom |
| 3. Reflowable | foliate-js vendored at `78914ae`; ReflowEngine; highlights via the overlayer; TOC, progress, themes; sanitizer in the load path; upload metadata through foliate; epub.js, react-reader, EmbedPDF removed | a real EPUB opens, progress is not 0, highlights survive reload |
| 4. Server | IR v2 (PDF boxes and page labels; EPUB block ids and page labels); rendition builder and endpoint; the reader loads renditions; locator → IR block mapping | a highlight maps to its IR block on real books |
| 5. Proof | browser tests on real books, benchmarks, docs, deployment | numbers recorded in `document-architecture.md` |
| Later | server search; PyMuPDF 2.0 layout (footnotes, captions, tables) after a corpus comparison; OCR text layer for scans and picture-only EPUBs on the Mac; edition paragraphs linked to source blocks; MOBI/AZW3/FB2/CBZ (render natively, convert for the IR), DOCX, TXT; a separate origin for book content | — |

## 10. Testing and benchmarking

- **Unit (TS and Python)**: normalization and quote matching on shared fixtures (Cyrillic, soft
  hyphens, ligatures, repeated phrases); locator building and resolving; Range handling (done);
  rendition sanitizing (scripts, handlers, `javascript:` URLs, SVG scripts, external CSS imports) and
  block ids; IR provenance on generated PDFs and EPUBs.
- **Browser (Playwright, Chromium and WebKit)**: open a real PDF and a real EPUB, select text,
  highlight, reload, verify the highlight is back at the same text; CSP blocks book scripts; progress
  moves.
- **Real books** (an opt-in corpus on disk, never committed): EN/RU/UK EPUBs (EPUB 2 with NCX, EPUB 3
  with nav and page-list, illustrated), a born-digital book PDF, a two-column paper, a scanned PDF, a
  picture-only EPUB.
- **Benchmarks**: time to first page, bytes fetched before first page, peak JS heap, on throttled
  and unthrottled networks, for a 1,000-page PDF and a large illustrated EPUB, old reader against new.
  Real iPhone measurements remain the owner's check (Safari Web Inspector), listed as open.
