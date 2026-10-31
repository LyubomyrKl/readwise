// Copies what PDF.js loads at run time into public/: the worker, and the files it fetches only for
// some documents (CMaps for CJK and legacy encodings, standard fonts for PDFs that do not embed
// them, the WASM image decoders, ICC colour profiles). Run by postinstall; public/pdfjs is ignored.
import { cpSync, mkdirSync, copyFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const root = dirname(require.resolve("pdfjs-dist/package.json"));

mkdirSync("public/pdf-worker", { recursive: true });
copyFileSync(join(root, "build/pdf.worker.min.mjs"), "public/pdf-worker/pdf.worker.min.mjs");
for (const dir of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
  cpSync(join(root, dir), join("public/pdfjs", dir), { recursive: true });
}
