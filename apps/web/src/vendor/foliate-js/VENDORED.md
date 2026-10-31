# foliate-js (vendored)

- Upstream: https://github.com/johnfactotum/foliate-js
- Commit: `78914aef4466eb960965702401634c2cb348e9b1` (2026-05-01, "Use original hrefs for external links and add isExternal in fb2.js (#129)")
- Licence: MIT (`LICENSE`, copyright John Factotum)

Upstream publishes no releases and warns that the API is not stable, so a copy is kept here and
owned like our code (docs/document-architecture.md explains the choice).

## What is here

The core modules: `view.js` (the `<foliate-view>` element), `epub.js`, `epubcfi.js`,
`paginator.js`, `fixed-layout.js`, `overlayer.js`, `progress.js`, `search.js`, `text-walker.js`,
`tts.js`, `mobi.js`, `fb2.js`, `comic-book.js`, and `vendor/zip.js`, `vendor/fflate.js`.

Left out: `pdf.js` and `vendor/pdfjs` (13 MB; PDFs use our pinned PDF.js), the demo reader
(`reader.html`, `reader.js`, `ui/`), `opds.js`, `dict.js`, `footnotes.js`, `quote-image.js`,
`uri-template.js`, tests and build files.

## Local changes

1. `view.js`, `makeBook`: the PDF branch throws `UnsupportedTypeError` instead of importing the
   left-out `pdf.js`.

## Updating

Copy the same files from a newer upstream commit (or from Readest's MIT fork,
https://github.com/readest/foliate-js, which carries iOS and large-chapter fixes), reapply the
local changes above, update the commit here, and run the reader browser tests.
