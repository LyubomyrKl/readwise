import * as pdfjsLib from "pdfjs-dist";
import ePub from "epubjs";

// Configure PDF.js worker - use local worker file
if (typeof window !== "undefined") {
  // Try local worker first, fallback to CDN
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf-worker/pdf.worker.min.mjs";
}

export interface BookMetadata {
  title?: string;
  author?: string;
  description?: string;
  pageCount: number | null;
}

/**
 * Extract metadata from a PDF file
 */
async function extractPdfMetadata(file: File): Promise<BookMetadata> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const metadata = await pdf.getMetadata();

    const info = metadata.info as any;

    return {
      title: info?.Title || undefined,
      author: info?.Author || undefined,
      description: info?.Subject || undefined,
      pageCount: pdf.numPages,
    };
  } catch (error) {
    console.error("Error extracting PDF metadata:", error);
    throw new Error("Failed to parse PDF file");
  }
}

/**
 * Extract metadata from an EPUB file
 * Note: EPUB doesn't have a strict page count concept, so we estimate based on locations
 */
async function extractEpubMetadata(file: File): Promise<BookMetadata> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    // Type assertion needed as epubjs types may not be complete
    const book = ePub(arrayBuffer as any) as any;

    await book.ready;

    // Extract metadata from the book
    const metadata = await book.loaded.metadata;

    // Generate locations to get a page count estimate
    // Using a chunk size of 1024 characters per "page"
    await book.locations.generate(1024);

    return {
      title: metadata?.title || undefined,
      author: metadata?.creator || undefined,
      description: metadata?.description || undefined,
      pageCount: book.locations.total,
    };
  } catch (error) {
    console.error("Error extracting EPUB metadata:", error);
    throw new Error("Failed to parse EPUB file");
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
    console.log("File type not supported for metadata extraction:", fileName);
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
