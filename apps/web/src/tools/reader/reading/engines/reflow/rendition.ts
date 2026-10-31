import type { FoliateBook } from "./foliate";

/** What the worker writes next to a rendition (docs/document-architecture.md, Rendition). */
export type RenditionManifest = { version: number; files: Record<string, number> };

/**
 * A reflowable book from its server rendition (sanitized, unzipped, block ids on every block),
 * read file by file: foliate's EPUB parser gets a loader that fetches only what the book shows,
 * with sizes from the manifest so progress needs no download of the rest. Files the manifest
 * does not list are reported missing without a request.
 */
export async function loadRendition(baseUrl: string): Promise<FoliateBook> {
  const base = baseUrl.replace(/\/$/, "");
  const response = await fetch(`${base}/wb-manifest.json`, { credentials: "same-origin" });
  if (!response.ok) throw new Error(`The book's rendition is not available (${response.status})`);
  const manifest = (await response.json()) as RenditionManifest;
  const url = (name: string) => `${base}/${name.split("/").map(encodeURIComponent).join("/")}`;
  const listed = (name: string) => Object.prototype.hasOwnProperty.call(manifest.files, name);

  const { EPUB } = (await import("@/src/vendor/foliate-js/epub.js")) as unknown as {
    EPUB: new (loader: {
      loadText: (name: string) => Promise<string | null>;
      loadBlob: (name: string) => Promise<Blob | null>;
      getSize: (name: string) => number;
    }) => { init(): Promise<FoliateBook> };
  };
  return new EPUB({
    loadText: async (name) => {
      if (!listed(name)) return null;
      const r = await fetch(url(name), { credentials: "same-origin" });
      return r.ok ? r.text() : null;
    },
    loadBlob: async (name) => {
      if (!listed(name)) return null;
      const r = await fetch(url(name), { credentials: "same-origin" });
      return r.ok ? r.blob() : null;
    },
    getSize: (name) => manifest.files[name] ?? 0,
  }).init();
}
