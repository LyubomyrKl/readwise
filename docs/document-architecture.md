# Document architecture: readers and understanding

The living guide to how Workbench renders books and how it understands them. Keep it in step with
the code. The evidence and the alternatives that were rejected are in
[`readers-investigation.md`](readers-investigation.md); this file says what is built, why, and how to
work on it.

## Principles

1. **Two responsibilities, two pipelines, one map.** Rendering (the original, faithfully, in the
   browser) and understanding (structured text for the edition pipeline, on the server) are built
   separately. Locator v2 and the IR's provenance tie them together.
2. **Native engines per family, not one universal renderer.** Fixed layout through PDF.js;
   reflowable through foliate-js. Other formats are converted to one of these, never rendered by a
   third engine.
3. **The quote is the record, everything else is a cache.** A position or highlight stores the text
   with context; a CFI, a quad or an offset is re-found by the quote when it no longer fits, and
   rewritten.
4. **Book content is untrusted.** It never runs: a strict policy on the reader page, script
   resources refused, documents sanitized on the way in (and on the server once renditions land).
5. **Load what is shown.** Ranges for PDFs; chapter by chapter for reflowable books once renditions
   land; nothing re-parsed per view on the server.
6. **Prove it on real books in real browsers.** Unit tests mock engines; the Playwright suite opens
   real files in Chrome and WebKit.

## Components

| Component | Where | Responsibility |
|---|---|---|
| Reader shell | `apps/web/src/tools/reader/reading/shell/ReaderShell.tsx` | the chrome for every format: header, contents, search, notes and highlights, settings, progress bar, keys, selection popover, position sync through `useReadingSession` |
| Engine interface | `reading/engines/types.ts` | `ReaderEngine`: open, goTo, goToPercent, next, prev, setHighlights, search, setPreferences, clearSelection, destroy; events: relocate, selection, highlight click, anchor update |
| PdfEngine | `reading/engines/pdf/PdfEngine.ts` | PDF.js 6.4.299 (legacy build) viewer components: `PDFViewer`, `EventBus`, `PDFLinkService`; text layer, outline, page labels, our highlight layer per page, search over `getTextContent` |
| ReflowEngine | `reading/engines/reflow/ReflowEngine.ts` | foliate-js (`src/vendor/foliate-js`, MIT, commit `78914ae`): `<foliate-view>`, CSS-column pagination or scrolling, TOC, section-size progress, search, SVG overlayer highlights |
| Rendition loader | `reading/engines/reflow/rendition.ts` | opens a server rendition file by file through foliate's EPUB parser (used once the API serves renditions) |
| Locator v2 | `reading/locator/` (web), `worker/tools/reader/locator.py` (workers) | the shared position model; one normalization tested on both sides with `packages/contracts/locator/normalize.cases.json`; quote building and Hypothesis-style matching |
| DOM text index | `reading/engines/domText.ts` | text of a DOM subtree with node offsets: a selection becomes a quote and position, a quote becomes a Range |
| API | `apps/api/src/tools/reader/` | `LocatorDto` validates every locator; downloads answer ranges with an ETag and immutable caching; the user's own files are not throttled |
| Understanding | `apps/workers/worker/tools/reader/ingest/` | the IR per file SHA-256 (sections, blocks, figures, language) for the edition engine |
| Reader policy | `apps/web/src/platform/security/csp.ts`, `apps/web/middleware.ts` | strict CSP with a nonce on `/apps/reader/book/:id/read` |

## Locator v2

```ts
type Locator = {
  v: 2; format: "pdf" | "epub";
  href?: string; blocks?: string[]; cfi?: string;                   // reflowable
  page?: number; pageLabel?: string; quads?: number[][];            // fixed layout (0-based page)
  continuation?: { page: number; quads: number[][] }[];
  quote?: { exact: string; prefix?: string; suffix?: string };      // normalized, <= 32 chars of context
  position?: { start: number; end: number };                        // code points in the chapter or page
  progression?: number; totalProgression?: number; engine?: string;
};
```

- Normalization: NFC, soft hyphens (U+00AD) dropped, the listed whitespace collapsed to one space;
  offsets that are stored count code points.
- Resolution: PDF draws from `quads` (PDF user space never changes for a file); a locator with only a
  quote is found in the page's text layer and its quads are reported back. EPUB checks that the CFI
  still covers `quote.exact`; if not, it finds the quote in the chapter (hint: `position.start`),
  takes the new CFI and reports it (`onAnchorUpdate` → `PATCH highlight {anchor}`).
- Storage: the `anchor` columns of highlights and notes and `reader_book.readingPosition`, as JSON.
  Older (v1) values are read through `toLocator` and replaced on the next save.
- The API refuses unknown fields and caps sizes (`LocatorDto`).

## Pipelines

**Upload.** The browser reads title, author, page count and cover for the form (PDF.js legacy
build; still epub.js for EPUB metadata, see Debt). The API stores the file and its SHA-256 and queues
`reader.ingest`.

**Reading a PDF.** `getDocument` with `rangeChunkSize` 256 KiB, `disableAutoFetch` and
`disableStream`: only what is shown is fetched. The API answers `Range` with 206, `Content-Range`,
an ETag of the file's SHA-256 and `Cache-Control: private, max-age=31536000, immutable`; the
Next.js proxy and Caddy pass ranges through untouched (neither compresses PDFs). Page labels come
from the file; dark and sepia recolour the page image only, the text layer stays selectable.

**Reading a reflowable book.** The file is fetched once and opened by foliate-js (the rendition path
replaces this, see Status); every document and SVG goes through `sanitizeBookDocument` in foliate's
`data` hook, script resources are refused in its `load` hook, and the page's CSP blocks what is left.

**Understanding.** `reader.ingest` builds the IR once per file hash; the edition engine reads it.

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

## Performance (measured)

| Case | Result |
|---|---|
| 184 MB illustrated PDF (200 image pages, printed by Chrome), first page text | 1.5 MB fetched (0.8%) in Node; the browser test asserts under 5% and no full download; first text in about 2 s on the local stack |
| 1.7 MB paper (JMLR), first page | 617 KB fetched (37%) |
| PDFs written by PyMuPDF (`insert_text`) | PDF.js fetches the whole file while opening (cause not pinned down; Chrome-, LaTeX- and publisher-made PDFs load in ranges) |
| EPUB open, English and Russian samples | first chapter shown in about 2.5 s on the local stack (whole file fetched; renditions will fetch per chapter) |
| Old reader | EmbedPDF downloaded every PDF entirely before the first page (7.7 MB WASM besides) |

Throttling: a PDF read in ranges makes dozens to hundreds of requests, so the user's own files skip
the API's per-session limits (`documents.controller.ts`, `OWN_FILES`); the default `SkipThrottle()`
only skips a throttler named `default`, so every name is listed.

## Testing

- Unit: `npm test` (locator, DOM text index, CSP, polyfill, shell wiring); `npm run test:workers`
  (the Python locator twin, ingest); API `document-files.service.spec.ts` (ranges),
  `locator.models.spec.ts` (validation).
- Browser: `npm run test:browser --workspace apps/web` against a running stack (`READER_BASE_URL`,
  default `https://localhost:18443`) with books in `READER_BOOKS` (default `/tmp/wbtest/books`, never
  committed). Chrome and WebKit; WebKit needs HTTPS because it does not send Secure cookies over
  plain http.
- The isolated test stack: `docker compose -p wbtest --env-file <own .env> -f docker-compose.yml -f <override>`
  where the override resets every `container_name`, gives the images their own names, maps Caddy to
  `127.0.0.1:18080/18443` and the API to `127.0.0.1:15173`, sets `SITE_ADDRESS=localhost` (Caddy's
  internal CA) and **its own network**: `docker-compose.yml` names the network `workbench_net`, and a
  second project joins the first one's network otherwise (service names then resolve across
  stacks).

## Adding a format

1. Reflowable formats foliate-js reads in the browser (MOBI, AZW3, FB2, CBZ): map the MIME type in
   `formatOf` (`createEngine.ts`) to the reflowable engine; foliate's `makeBook` detects the format.
   For the IR, convert to EPUB in the worker (calibre `ebook-convert` for MOBI/AZW3) and run the
   EPUB ingest.
2. Formats without a web engine (DOCX, TXT, HTML): convert to EPUB in the worker (mammoth for DOCX;
   paragraphs for TXT), store the conversion next to the original, and serve it as the rendition;
   split chapters over ~300 KB (CSS columns stall on huge chapters).
3. Fixed-layout formats: only PDF today; anything else is converted to PDF or EPUB, not given a
   third engine.
4. Extend `LOCATOR_FORMATS` (API) and `BookFormat` (web) when a new family needs its own locator
   fields; otherwise the reflowable fields apply.

## Status (2026-10-31)

| Phase | State |
|---|---|
| Foundations: ranges, Locator v2 (web, API, workers), engine interface, shell, CSP | done |
| PDF on PDF.js | done: text layer, highlights (quads + quote), notes, outline, page labels, search, themes, zoom, ranges |
| Reflowable on foliate-js | done: EPUB with highlights, TOC, section-size progress, search, themes, type size, line height, flow |
| Old engines removed | EmbedPDF and react-reader removed from the readers; epub.js remains only for upload metadata (Debt) |
| Server rendition (sanitized, block ids) and IR v2 provenance (PDF boxes, page labels, EPUB block ids) | not started; the loader and the `blocks` field are ready for it |
| Browser tests on real books, Chrome and WebKit | 16 passing |

## Debt and open points

- **Renditions and IR v2** (next): the worker writes a sanitized, unzipped rendition with
  `data-wb-b` block ids and builds the IR from it; PDF blocks get boxes and page labels; the API
  serves `/reader/documents/:id/rendition/<path>`; the reader uses `rendition.ts`.
- **Upload metadata** still uses epub.js for EPUBs: move it to foliate's `makeBook` (title, author,
  cover) and drop epub.js.
- **PDF chapter name** in the bottom bar is empty: resolving every outline entry to a page loads
  page objects across the whole file; take section pages from the server structure instead.
- **Pinch zoom** on phones for PDFs is not wired (the old reader had custom gestures); zoom buttons
  and fit-to-width work.
- **iPhone Safari** has not been tried on a device: WebKit tests pass on the desktop; foliate lists no
  Safari support, Readest's MIT fork carries iOS fixes.
- **Search** reads every page (PDF) or section (EPUB) in the browser; a server search over the IR
  would be faster on large books.
- **Uploads** are buffered in the API's memory (up to the 1 GB limit in a 512 MB container).
- **Scanned PDFs and picture-only EPUBs** have no text layer: OCR on the Mac (Gemma 4 now; Surya or
  PaddleOCR-VL to evaluate) and an invisible text layer are planned.
- **PyMuPDF 2.0** layout analysis (footnotes, captions, tables) to evaluate on the corpus before
  upgrading; pin versions (its licence changed three times in a year).

## References

- PDF.js: https://github.com/mozilla/pdf.js, FAQ https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions
- foliate-js: https://github.com/johnfactotum/foliate-js; Readest's fork https://github.com/readest/foliate-js
- Readium Locator: https://readium.org/architecture/models/locators/
- W3C Web Annotation: https://www.w3.org/TR/annotation-model/
- Hypothesis anchoring: https://github.com/hypothesis/client/tree/main/src/annotator/anchoring
- EPUB 3.3 page-list: https://www.w3.org/TR/epub-33/#sec-nav-pagelist
- WebKit bug 218086: https://bugs.webkit.org/show_bug.cgi?id=218086
- Next.js CSP: https://nextjs.org/docs/app/guides/content-security-policy
