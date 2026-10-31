import type { BookFormat } from "../locator";
import type { BookSource, EngineEvents, ReaderEngine, SearchHit } from "./types";

/** The reader family of a file: fixed layout (PDF) or reflowable (EPUB). */
export function formatOf(mime: string, fileUrl = ""): BookFormat {
  if (mime === "application/pdf" || fileUrl.toLowerCase().endsWith(".pdf")) return "pdf";
  return "epub";
}

/** An engine that can also show one search hit (both of ours can). */
export type ShellEngine = ReaderEngine & { showSearchHit(hit: SearchHit): Promise<void>; scale?: number };

/** Loads the engine for a book's family on demand: neither PDF.js nor foliate-js is in the main bundle. */
export async function createEngine(source: BookSource, events: EngineEvents): Promise<ShellEngine> {
  if (formatOf(source.mime, source.fileUrl) === "pdf") {
    const { PdfEngine } = await import("./pdf/PdfEngine");
    return new PdfEngine(source, events);
  }
  const { ReflowEngine } = await import("./reflow/ReflowEngine");
  return new ReflowEngine(source, events);
}
