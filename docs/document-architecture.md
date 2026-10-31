# Document architecture: readers and understanding

The living guide to how Workbench renders books and how it understands them. Keep it in step with
the code. The evidence and the alternatives that were rejected are in
[`readers-investigation.md`](readers-investigation.md); this file says what is built, why, and how to
work on it.

## Principles

1. **Two responsibilities, two pipelines, one map.** Rendering (the original, faithfully, in the
   browser) and understanding (structured text for the edition pipeline, on the server) are built
   separately. Locator v2, and the page or chapter each IR block comes from, tie them together.
2. **Native engines per family, not one universal renderer.** Fixed layout through PDF.js;
   reflowable through foliate-js. Other formats are converted to one of these, never rendered by a
   third engine.
3. **The quote is the record, everything else is a cache.** A position or highlight stores the text
   with context; a CFI, a quad or an offset is found again by the quote when it no longer fits, and
   rewritten. The server maps locators to IR blocks the same way.
4. **Book content is untrusted.** It never runs: a strict policy on the reader page, script
   resources refused, documents sanitized on the way into the frame.
5. **Load what is shown, from the original.** PDFs and large EPUBs are read in HTTP ranges of the
   uploaded file; nothing derived is stored for reading, nothing is re-parsed per view on the server.
6. **Prove it on real books in real browsers.** Unit tests mock engines; the Playwright suite opens
   real files in Chrome and WebKit.

## Components

| Component | Where | Responsibility |
|---|---|---|
| Reader shell | `apps/web/src/tools/reader/reading/shell/ReaderShell.tsx` | the chrome for every format: header (with the chapter), contents, search, notes and highlights, settings, progress bar, keys, selection popover, position sync through `useReadingSession` |
| Engine interface | `reading/engines/types.ts` | `ReaderEngine`: open, goTo, goToPercent, next, prev, setHighlights, search, setPreferences, clearSelection, destroy; events: relocate, selection, highlight click, anchor update |
| PdfEngine | `reading/engines/pdf/PdfEngine.ts` | PDF.js 6.4.299 (legacy build) viewer components: `PDFViewer`, `EventBus`, `PDFLinkService`; text layer, outline, page labels, our highlight layer per page, search over `getTextContent`; `polyfills.ts` adds the stream iteration WebKit lacks |
| ReflowEngine | `reading/engines/reflow/ReflowEngine.ts` | foliate-js (`src/vendor/foliate-js`, MIT, commit `78914ae`): `<foliate-view>`, CSS-column pagination or scrolling, TOC, section-size progress, search, SVG overlayer highlights |
| Zip range reader | `reading/engines/reflow/zipRanges.ts` | an EPUB over 4 MB is read entry by entry in HTTP ranges: a zip.js reader on the download endpoint |
| Locator v2 | `reading/locator/` (web), `worker/tools/reader/locator.py` (workers) | the shared position model; one normalization tested on both sides with `packages/contracts/locator/normalize.cases.json`; quote building and Hypothesis-style matching |
| DOM text index | `reading/engines/domText.ts` | text of a DOM subtree with node offsets: a selection becomes a quote and position, a quote becomes a Range |
| API | `apps/api/src/tools/reader/` | `LocatorDto` validates every locator; downloads answer ranges with an ETag and immutable caching; the user's own files are not throttled; saving a position moves the library's pages read |
| Understanding | `apps/workers/worker/tools/reader/ingest/` | the IR per file SHA-256 (sections, blocks with their page or document, figures, language, page labels) and its structure summary |
| The map | `worker/tools/reader/ingest/anchors.py` | `blocks_for(doc, locator)`: the IR blocks a highlight or position covers; `locator_for(doc, index)`: a locator that opens the original at a block |
| Reader policy | `apps/web/src/platform/security/csp.ts`, `apps/web/middleware.ts` | strict CSP with a nonce on `/apps/reader/book/:id/read` |

## Locator v2

```ts
type Locator = {
  v: 2; format: "pdf" | "epub";
  href?: string; cfi?: string;                                      // reflowable: chapter path, CFI cache
  page?: number; pageLabel?: string; quads?: number[][];            // fixed layout (0-based page, PDF user space)
  continuation?: { page: number; quads: number[][] }[];
  quote?: { exact: string; prefix?: string; suffix?: string };      // normalized, <= 32 chars of context
  position?: { start: number; end: number };                        // code points in the chapter or page
  progression?: number; totalProgression?: number; engine?: string;
};
```

- Normalization: NFC, soft hyphens (U+00AD) dropped, the listed whitespace collapsed to one space;
  offsets that are stored count code points.
- Matching (web and workers alike): exact occurrences ranked by context and nearness to the
  position; otherwise approximate, with up to half the quote's length in errors. A quote shorter than
  10 characters (a page number, one word) is found exactly or not at all.
- Resolution: PDF draws from `quads` (PDF user space never changes for a file); a locator with only a
  quote is found in the page's text layer and its quads are reported back. EPUB checks that the CFI
  still covers `quote.exact`; if not, it finds the quote in the chapter (hint: `position.start`),
  takes the new CFI and reports it (`onAnchorUpdate` → `PATCH highlight {anchor}`).
- Storage: the `anchor` columns of highlights and notes and `reader_book.readingPosition`, as JSON.
  Older (v1) values are read through `toLocator` and replaced on the next save.
- The API refuses unknown fields and caps sizes (`LocatorDto`).

## Pipelines

**Upload.** The browser reads title, author, page count and cover for the form with the reader's
own parsers (`documents/bookParser.ts`: PDF.js legacy build; foliate-js `makeBook` for EPUB, nothing
rendered). An EPUB's page count is its print pages when it has a page-list, otherwise foliate's
locations (one per 1500 bytes of linear sections), so the library and the reader's "12 / 240" agree.
The API stores the file and its SHA-256 and queues `reader.ingest`. Saving a reading position also
sets the library's pages read (`pagesRead`: the PDF page, or the book's share times its pages).

**Reading a PDF.** `getDocument` with `rangeChunkSize` 256 KiB, `disableAutoFetch` and
`disableStream`: only what is shown is fetched. The API answers `Range` with 206, `Content-Range`,
an ETag of the file's SHA-256 and `Cache-Control: private, max-age=31536000, immutable`; the
Next.js proxy and Caddy pass ranges through untouched (neither compresses PDFs or EPUBs). Page
labels come from the file; dark and sepia recolour the page image only, the text layer stays
selectable. The chapter in the header comes from the server's structure (`shell/sections.ts`): its
sections carry their first page, which the engine cannot know without loading page objects across
the whole file.

**Reading a reflowable book.** Up to 4 MB the file is downloaded once (one request; every page
turn is local after that). Above, `zipRanges.ts` gives zip.js a reader over HTTP ranges: the central
directory comes from the end of the file, then each entry only when foliate asks for it (container,
OPF, navigation, the chapter on screen and its pictures); section sizes for progress come from the
central directory. A 64 KiB read-ahead turns an entry's header and data into one request; entry
data streams in 1 MiB pieces. Every document and SVG goes through `sanitizeBookDocument` in
foliate's `data` hook, script resources are refused in its `load` hook, and the page's CSP blocks
what is left.

**Understanding.** `reader.ingest` builds the IR once per file hash; the edition engine reads it.
Every block records where it comes from: the 1-based page (PDF) or the document path (EPUB, the same
string as foliate's section id and the locator's `href`). PDFs keep their printed page labels
(`Document.page_labels`, only when the file defines them). The structure summary the API serves
gives each section its `page` and `pageLabel` or its `href`. When an IR is reused (the same file
again, an edition job), its structure summary is written again from it, so books read before a new
field existed get it on their next ingest.

`IR_VERSION` stays 1 for these additions: they are optional fields, and the version is part of the
edition engine's cache key, so raising it would throw away every cached chapter of editions in
progress. Raise it only when the edition engine must see the change.

## The map

`anchors.py` connects what the reader stores to what the worker extracted:

- **Locator → blocks.** The quote is searched in the text blocks of the locator's page (PDF, plus
  the page before: a paragraph cut by a page break belongs to the page it starts on) or chapter
  (EPUB, by `href`, fragments and escapes ignored), with the stored position as the hint between
  repeats. Without a quote: the block at the progression, else the first block of the page or
  chapter. Text the IR leaves out (running heads, page numbers, scans without OCR) maps to nothing.
- **Block → locator.** The block's page (with its label) or chapter, and its first 120 characters
  as the quote; both engines open a quote-only locator by finding the text.

Positions are matched by the quote rather than by offsets or geometry because the IR's text is not
the reader's: running heads and note markers are removed, hyphenated words joined, paragraphs
merged across pages. No boxes are stored for PDF blocks; PDF.js finds the quote in the page's text
layer, which is exact.

Consumers to come: "open the original here" from an edition paragraph (the abridge job records
source blocks), and a book's highlights shown in its edition.

## Security

- `/apps/reader/book/:id/read` sends `script-src 'self' 'nonce-…' 'strict-dynamic' 'wasm-unsafe-eval'`,
  `style-src 'self' 'unsafe-inline' blob:`, `img-src`/`font-src`/`media-src 'self' blob: data:`,
  `frame-src`/`child-src`/`worker-src 'self' blob:`, `connect-src 'self'`, `object-src 'none'`,
  `base-uri 'none'`, `frame-ancestors 'self'`. Chapter documents (blob:) inherit it: their script
  tags and inline handlers do not run (browser test). `'strict-dynamic'` trusts scripts created by
  running code; book content never runs, so it never gets there.
- `frame-ancestors 'self'` matters: Caddy adds `frame-ancestors 'none'` to pages without a policy,
  and Safari applied it to the chapter documents, which then never displayed.
- Book frames are `allow-same-origin allow-scripts` in every web engine (WebKit bug 218086); the
  policy, not the sandbox, is the boundary.
- next-themes' inline script has no nonce on the read page and is refused (the theme class is then
  applied on hydration; harmless).
- Downloads are attachments with `nosniff`; a stored type other than PDF or EPUB goes out as
  `application/octet-stream`.

## Decisions

| Decision | Why | Instead of |
|---|---|---|
| PDF.js viewer components for PDF | ranges, text layer, page labels, outline, the de facto standard; legacy build because the modern one assumes newer Safari | EmbedPDF (whole-file only, 7.7 MB WASM), PDFium in the browser |
| foliate-js vendored for reflowable books | maintained, MIT, reads EPUB/MOBI/FB2/CBZ, section-size progress, overlayer | epub.js (last release 2022, progress was always 0 here), Readium web (heavier, server-side streamer) |
| EPUB read in ranges of the original | the 65 MB test book shows its first chapter after 1.8 MB; no derived copy to store, version or invalidate; works for every book already uploaded | the planned server rendition (unzipped, sanitized, with block ids): more storage, an endpoint and a migration for the same loading and a second sanitizer, while the CSP is the boundary that is tested |
| Quote-first locators, matched the same way on both sides | survives re-rendering, engine upgrades and the IR's own text cleanup | CFIs or quads alone (break on any change), block ids in a rendition (dropped with it) |
| Optional IR fields, version unchanged | keeps the edition engine's caches | an IR v2 that rebuilds everything |

## Performance (measured)

On the local test stack (Docker on the Mac, HTTPS through Caddy and the Next.js proxy, like
production), Playwright, Chrome and WebKit 26:

| Case | Result |
|---|---|
| 184 MB illustrated PDF (200 image pages, printed by Chrome), first page text | 1.0 s; 2.6 MB fetched (1.4%), Chrome and WebKit alike |
| 65 MB illustrated EPUB (40 chapters, a 1.6 MB picture each), first chapter text | 1.1 s; 1.8 MB fetched (2.8%), of which the cover picture is 1.6 MB; opening (central directory, container, OPF, navigation) is 5 requests and 85 KB |
| The last chapter of the same EPUB through the contents | under 20% of the file fetched in all (asserted) |
| Small EPUBs (160 KB, 2 MB) | downloaded whole in one request; first chapter in under 3 s |
| 1.7 MB paper (JMLR), first page | 617 KB fetched (37%) |
| PDFs written by PyMuPDF (`insert_text`) | PDF.js fetches the whole file while opening (cause not pinned down; Chrome-, LaTeX- and publisher-made PDFs load in ranges) |
| Old reader | EmbedPDF and epub.js downloaded every book entirely before the first page (EmbedPDF's 7.7 MB WASM besides): 184 MB and 65 MB for the two books above |

Over a 20 Mbit/s phone connection that is about 1 s instead of 74 s for the PDF, and under 1 s
instead of 26 s for the EPUB (bytes divided by bandwidth; not measured on a phone).

Throttling: a PDF read in ranges makes dozens to hundreds of requests, so the user's own files skip
the API's per-session limits (`documents.controller.ts`, `OWN_FILES`); the default `SkipThrottle()`
only skips a throttler named `default`, so every name is listed.

## Testing

- Unit: `npm test` (locator, quote matching, DOM text index, zip range reader, chapter lookup, CSP,
  polyfill, upload metadata, shell wiring); `npm run test:workers` (the Python locator twin, ingest,
  page labels, section sources, the map); API `document-files.service.spec.ts` (ranges),
  `locator.models.spec.ts` (validation), `highlights.service.spec.ts`, `documents.service.spec.ts`
  (pages read).
- Browser: `npm run test:browser --workspace apps/web` against a running stack (`READER_BASE_URL`,
  default `https://localhost:18443`) with books in `READER_BOOKS` (default `/tmp/wbtest/books`, never
  committed: `big-1000.pdf`, `big-scan.pdf`, `dropout.pdf`, `russell.epub`, `moskovia.epub`,
  `big-illustrated.epub`; tests skip books that are not there). Chrome and WebKit; WebKit needs HTTPS
  because it does not send Secure cookies over plain http. 22 tests: ranges for both large books,
  outline, search, chapter name, highlights surviving reloads, progress and reopening, CSP, upload
  metadata. Run nothing else heavy in Docker meanwhile: a starved stack answers in 20 s and the
  tests time out.
- The map on real books: `READER_ANCHORS=1 npx playwright test e2e/anchors.spec.ts --project chrome`
  highlights across each book and writes `READER_BOOKS/anchors.json`; then
  `READER_BOOKS=/tmp/wbtest/books npm run test:workers` checks every one against the IR built from the
  same file (last run: 22 of 23 found their block; the 23rd was a page number, which the IR drops).
- The isolated test stack: `docker compose -p wbtest --env-file <own .env> -f docker-compose.yml -f <override>`
  where the override resets every `container_name`, gives the images their own names, maps Caddy to
  `127.0.0.1:18080/18443` and the API to `127.0.0.1:15173`, sets `SITE_ADDRESS=localhost` (Caddy's
  internal CA) and **its own network**: `docker-compose.yml` names the network `workbench_net`, and a
  second project joins the first one's network otherwise (service names then resolve across
  stacks). Rebuild with `up -d --build --force-recreate <services>`; without `--force-recreate` the
  old containers keep running.

## Adding a format

1. Reflowable formats foliate-js reads in the browser (MOBI, AZW3, FB2, CBZ): map the MIME type in
   `formatOf` (`createEngine.ts`) to the reflowable engine; foliate's `makeBook` detects the format
   (ranges apply to EPUB only; the others download whole). For the IR, convert to EPUB in the worker
   (calibre `ebook-convert` for MOBI/AZW3) and run the EPUB ingest.
2. Formats without a web engine (DOCX, TXT, HTML): convert to EPUB in the worker (mammoth for DOCX;
   paragraphs for TXT), store the conversion as a second file of the book, and open that in the
   reflowable engine; split chapters over ~300 KB (CSS columns stall on huge chapters).
3. Fixed-layout formats: only PDF today; anything else is converted to PDF or EPUB, not given a
   third engine.
4. Extend `LOCATOR_FORMATS` (API) and `BookFormat` (web) when a new family needs its own locator
   fields; otherwise the reflowable fields apply.

## Status (2026-10-31)

| Phase | State |
|---|---|
| Foundations: ranges, Locator v2 (web, API, workers), engine interface, shell, CSP | done |
| PDF on PDF.js | done: text layer, highlights (quads + quote), notes, outline, page labels, chapter name, search, themes, zoom, ranges |
| Reflowable on foliate-js | done: EPUB with highlights, TOC, section-size progress, search, themes, type size, line height, flow; large books in ranges |
| Old engines removed | EmbedPDF, epub.js, react-reader and @use-gesture removed; the upload form reads metadata with PDF.js and foliate-js |
| Server side | done: block sources and page labels in the IR, section pages and documents in the structure, the map both ways, checked on real books |
| Browser tests on real books, Chrome and WebKit | 22 passing, plus the opt-in collection for the map |

## Debt and open points

- **Books ingested before** have no section pages in their structure until their ingest runs again
  (the same file uploaded again, or an edition made): their PDFs show no chapter name in the header.
- **Pinch zoom** on phones for PDFs is not wired (the old reader had custom gestures); zoom buttons
  and fit-to-width work.
- **iPhone Safari** has not been tried on a device: WebKit tests pass on the desktop; foliate lists no
  Safari support, Readest's MIT fork carries iOS fixes.
- **Search** reads every page (PDF) or section (EPUB) in the browser; a server search over the IR
  would be faster on large books (and would use the map to open hits).
- **EPUB page-list labels** are not in the IR yet (the reader shows them from the book itself).
- **Uploads** are buffered in the API's memory (up to the 1 GB limit in a 512 MB container).
- **Scanned PDFs and picture-only EPUBs** have no text layer: OCR on the Mac (Gemma 4 now; Surya or
  PaddleOCR-VL to evaluate) and an invisible text layer are planned.
- **PyMuPDF 2.0** layout analysis (footnotes, captions, tables) to evaluate on the corpus before
  upgrading; pin versions (its licence changed three times in a year).
- **Huge chapters** (over ~300 KB of XHTML) paginate slowly in CSS columns; splitting them needs a
  converted copy (see Adding a format, 2).

## References

- PDF.js: https://github.com/mozilla/pdf.js, FAQ https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions
- foliate-js: https://github.com/johnfactotum/foliate-js; Readest's fork https://github.com/readest/foliate-js
- zip.js (readers, ranges): https://gildas-lormeau.github.io/zip.js/
- Readium Locator: https://readium.org/architecture/models/locators/
- W3C Web Annotation: https://www.w3.org/TR/annotation-model/
- Hypothesis anchoring: https://github.com/hypothesis/client/tree/main/src/annotator/anchoring
- EPUB 3.3 page-list: https://www.w3.org/TR/epub-33/#sec-nav-pagelist
- PDF page labels (ISO 32000-1, 12.4.2): https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/PDF32000_2008.pdf
- WebKit bug 218086: https://bugs.webkit.org/show_bug.cgi?id=218086
- Next.js CSP: https://nextjs.org/docs/app/guides/content-security-policy
