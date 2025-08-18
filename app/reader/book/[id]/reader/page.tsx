"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Loader2 } from "lucide-react";
import VirtualPDFReader from "../components/PDFReader";
import EPUBReader from "../components/EPUBReader";
import PDFReaderMenu from "../components/PDFReaderMenu";
import { IBook } from "../../../types";

export default function BookReaderPage() {
  const params = useParams();
  const router = useRouter();
  const bookId = params.id as string;

  const [book, setBook] = useState<IBook | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);


  // PDF Settings
  const [pdfSettings, setPdfSettings] = useState({
    zoom: 100,
    rotation: 0 as 0 | 90 | 180 | 270,
    viewMode: "single" as "single" | "double" | "continuous",
    fitMode: "width" as "width" | "height" | "page" | "auto",
    theme: "light" as "light" | "dark",
    showThumbnails: false,
    showBookmarks: false,
    invertColors: false,
    enableTextSelection: true,
    enableAnnotations: true,
    pageSpacing: 10,
    backgroundColor: "#ffffff",
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    async function fetchBook() {
      try {
        setLoading(true);
        const response = await fetch(`/api/books/${bookId}`, {
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch book: ${response.status}`);
        }

        const bookData = await response.json();
        setBook(bookData.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load book");
      } finally {
        setLoading(false);
      }
    }

    if (bookId) {
      fetchBook();
    }
  }, [bookId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Loading book...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-red-600 mb-2">Error</h1>
          <p className="text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  if (!book) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-xl font-semibold mb-2">Book not found</h1>
          <p className="text-muted-foreground">
            The requested book could not be found.
          </p>
        </div>
      </div>
    );
  }

  const isEPUB =
    book.mime === "application/epub+zip" ||
    book.mime === "application/epub" ||
    (book.fileUrl && book.fileUrl.toLowerCase().endsWith(".epub"));

  if (isEPUB) {
    return (
      <div className="relative w-full h-full">
        <EPUBReader
          book={book}
          onBackAction={() => router.back()}
          // onCreateHighlight={(h) => api.highlights.create(book.id, h)}
          // onLocationPersist={(id, cfi, pct) => api.reading.save(id, { cfi, pct })}
        />
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <VirtualPDFReader book={book} />
      <PDFReaderMenu
        settings={pdfSettings}
        onSettingsChange={(newSettings) =>
          setPdfSettings({ ...pdfSettings, ...newSettings })
        }
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
      />
    </div>
  );
}
