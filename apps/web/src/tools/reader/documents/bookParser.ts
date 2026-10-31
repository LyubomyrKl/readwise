import type { FoliateBook } from "@tools/reader/reading/engines/reflow/foliate";

export interface BookMetadata {
  title?: string;
  author?: string;
  description?: string;
  pageCount: number | null;
  coverImage?: string; // Base64 data URL or blob URL
}

/**
 * Extract metadata from a PDF file
 */
async function extractPdfMetadata(file: File): Promise<BookMetadata> {
  // Dynamic import to avoid SSR issues with pdfjs-dist
  // the legacy build, as in the reader: the one PDF.js supports on Safari
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

  // Configure PDF.js worker
  if (typeof window !== "undefined") {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf-worker/pdf.worker.min.mjs";
  }

  let loadingTask: ReturnType<typeof pdfjsLib.getDocument> | undefined;
  try {
    const arrayBuffer = await file.arrayBuffer();
    loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    const metadata = await pdf.getMetadata();

    const info = metadata.info as { Title?: string; Author?: string; Subject?: string } | undefined;

    // Extract cover image from first page
    let coverImage: string | undefined;
    try {
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1.5 });

      // Create canvas to render the page
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      if (!context) {
        throw new Error("Failed to get canvas 2D context");
      }

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      // Render PDF page to canvas
      await page.render({ canvas, canvasContext: context, viewport }).promise;

      // Convert canvas to data URL
      coverImage = canvas.toDataURL("image/jpeg", 0.8);
    } catch (coverError) {
      console.warn("Failed to extract PDF cover image:", coverError);
    }

    return {
      title: info?.Title || undefined,
      author: info?.Author || undefined,
      description: info?.Subject || undefined,
      pageCount: pdf.numPages,
      coverImage,
    };
  } catch (error) {
    console.error("Error extracting PDF metadata:", error);
    throw new Error("Failed to parse PDF file");
  } finally {
    // Frees the document and terminates its worker; a failed cleanup must not fail the parse
    loadingTask?.destroy().catch(() => {});
  }
}

/** A Blob as a data URL (the upload form shows it and sends it as the cover). */
function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** foliate's names: a string, a language map ({ "en": "…" }), a contributor ({ name }), or a list of them. */
function nameOf(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (Array.isArray(value)) return value.map(nameOf).filter(Boolean).join(", ") || undefined;
  if (value && typeof value === "object") {
    if ("name" in value) return nameOf((value as { name: unknown }).name);
    return nameOf(Object.values(value)[0]);
  }
  return undefined;
}

/** EPUB descriptions are often HTML; the form wants the text (DOMParser runs no scripts and loads nothing). */
function plainText(html: unknown): string | undefined {
  if (typeof html !== "string") return undefined;
  const text = new DOMParser().parseFromString(html, "text/html").body.textContent ?? "";
  return text.replace(/\s+/g, " ").trim() || undefined;
}

/**
 * The page count of a reflowable book: its print pages when it lists them (page-list), otherwise
 * the reader's own locations (foliate counts one per 1500 bytes of the linear sections), so the
 * library and the reader's "12 / 240" agree.
 */
export function reflowPageCount(book: Pick<FoliateBook, "sections" | "pageList">): number | null {
  if (book.pageList?.length) return book.pageList.length;
  const size = book.sections.reduce((sum, s) => sum + (s.linear !== "no" && (s.size ?? 0) > 0 ? s.size! : 0), 0);
  return size > 0 ? Math.ceil(size / 1500) : null;
}

/** EPUB metadata with foliate-js, the parser the reader opens the book with; nothing is rendered. */
async function extractEpubMetadata(file: File): Promise<BookMetadata> {
  const { makeBook } = (await import("@/src/vendor/foliate-js/view.js")) as unknown as {
    makeBook: (file: File) => Promise<FoliateBook>;
  };
  let book: FoliateBook | undefined;
  try {
    book = await makeBook(file);
    let coverImage: string | undefined;
    try {
      const cover = await book.getCover?.();
      if (cover) coverImage = await dataUrl(cover);
    } catch (coverError) {
      console.warn("Failed to extract EPUB cover image:", coverError);
    }
    return {
      title: nameOf(book.metadata?.title),
      author: nameOf(book.metadata?.author),
      description: plainText(book.metadata?.description),
      pageCount: reflowPageCount(book),
      coverImage,
    };
  } catch (error) {
    console.error("Error extracting EPUB metadata:", error);
    throw new Error("Failed to parse EPUB file");
  } finally {
    book?.destroy?.();
  }
}

/**
 * Extract metadata from a book file (PDF or EPUB)
 * Returns metadata with pageCount as null if the file type is not supported or if parsing fails
 */
export async function extractBookMetadata(file: File): Promise<BookMetadata> {
  const fileName = file.name.toLowerCase();
  const mimeType = file.type;

  try {
    // Check if it's a PDF
    if (fileName.endsWith(".pdf") || mimeType === "application/pdf") {
      return await extractPdfMetadata(file);
    }

    // Check if it's an EPUB
    if (
      fileName.endsWith(".epub") ||
      mimeType === "application/epub+zip" ||
      mimeType === "application/epub"
    ) {
      return await extractEpubMetadata(file);
    }

    // For TXT files or other formats, we don't have a reliable way to determine page count
    return { pageCount: null };
  } catch (error) {
    console.error("Failed to extract book metadata:", error);
    return { pageCount: null };
  }
}

/**
 * Extract page count from a book file (PDF or EPUB)
 * Returns null if the file type is not supported or if parsing fails
 * @deprecated Use extractBookMetadata instead
 */
export async function extractPageCount(file: File): Promise<number | null> {
  const metadata = await extractBookMetadata(file);
  return metadata.pageCount;
}
