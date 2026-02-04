"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useCallback, useRef } from "react";

import { Loader2 } from "lucide-react";
import VirtualPDFReader from "@/app/reader/book/[id]/(components)/PDFReader";
import EPUBReader from "@/app/reader/book/[id]/(components)/EPUBReader";
import { IBook } from "../../../types";
import { apiFetch } from "@/lib/fetcher";
import { useReadingSession } from "@/hooks/useReadingSession";
import { useHighlights } from "@/hooks/useHighlights";
import { useNotes } from "@/hooks/useNotes";
import type { ReadingPosition, CreateHighlightDto, HighlightResponse } from "@/lib/types";

export default function BookReaderPage() {
  const params = useParams();
  const router = useRouter();
  const bookId = params.id as string;

  const [book, setBook] = useState<IBook | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current || !bookId) return;
    fetchedRef.current = true;

    async function fetchBook() {
      try {
        setLoading(true);
        const response = await apiFetch("GET", "/api/books/[id]", undefined, { id: bookId });
        setBook(response.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load book");
      } finally {
        setLoading(false);
      }
    }

    fetchBook();
  }, [bookId]);

  // Initialize reading session with position from book data
  const { position, setPosition, forceSave } = useReadingSession({
    bookId,
    initialPosition: book?.readingPosition,
    autoSaveInterval: 30_000, // Save every 30 seconds
  });

  // Initialize highlights management
  const {
    highlights,
    createHighlight,
    updateHighlight,
    deleteHighlight,
  } = useHighlights({
    bookId,
    initialHighlights: book?.highlights || [],
  });

  // Initialize notes management
  const {
    notes,
    createNote,
    updateNote,
    deleteNote,
  } = useNotes({
    bookId,
    initialNotes: book?.notes || [],
  });

  // Handle back navigation with save
  const handleBack = useCallback(async () => {
    await forceSave();
    router.back();
  }, [forceSave, router]);

  // Handle position change from readers
  const handlePositionChange = useCallback(
    (newPosition: ReadingPosition) => {
      setPosition(newPosition);
    },
    [setPosition]
  );

  // Handle highlight creation
  const handleCreateHighlight = useCallback(
    async (dto: CreateHighlightDto): Promise<HighlightResponse | null> => {
      return createHighlight(dto);
    },
    [createHighlight]
  );

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
          initialPosition={position}
          highlights={highlights}
          notes={notes}
          onBackAction={handleBack}
          onPositionChange={handlePositionChange}
          onCreateHighlight={handleCreateHighlight}
          onUpdateHighlight={updateHighlight}
          onDeleteHighlight={deleteHighlight}
          onCreateNote={createNote}
          onUpdateNote={updateNote}
          onDeleteNote={deleteNote}
        />
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <VirtualPDFReader
        book={book}
        initialPosition={position}
        highlights={highlights}
        notes={notes}
        onBackAction={handleBack}
        onPositionChange={handlePositionChange}
        onCreateHighlight={handleCreateHighlight}
        onUpdateHighlight={updateHighlight}
        onDeleteHighlight={deleteHighlight}
        onCreateNote={createNote}
        onUpdateNote={updateNote}
        onDeleteNote={deleteNote}
      />
    </div>
  );
}
