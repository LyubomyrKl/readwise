import ePub from "epubjs";

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
  const pdfjsLib = await import("pdfjs-dist");

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

    const info = metadata.info as any;

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
      const renderContext: any = {
        canvasContext: context,
        viewport: viewport,
      };

      await page.render(renderContext).promise;

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

async function extractEpubMetadata(file: File): Promise<BookMetadata> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    // Type assertion needed as epubjs types may not be complete
    const book = ePub(arrayBuffer as any) as any;

    await book.ready;

    // Extract metadata from the book
    const metadata = await book.loaded.metadata;

    // Extract cover image
    let coverImage: string | undefined;
    try {
      const cover = await book.coverUrl();
      if (cover) {
        // If it's a blob URL, fetch it and convert to data URL
        if (cover.startsWith("blob:")) {
          const response = await fetch(cover);
          const blob = await response.blob();
          coverImage = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
        } else {
          coverImage = cover;
        }
      }
    } catch (coverError) {
      console.warn("Failed to extract EPUB cover image:", coverError);
    }

    // Generate locations to get a page count estimate
    // Using a chunk size of 1024 characters per "page"
    await book.locations.generate(1024);

    return {
      title: metadata?.title || undefined,
      author: metadata?.creator || undefined,
      description: metadata?.description || undefined,
      pageCount: book.locations.total,
      coverImage,
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
