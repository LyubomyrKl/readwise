"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback } from "react";

import { Loader2 } from "lucide-react";
import VirtualPDFReader from "@tools/reader/reading/PDFReader";
import EPUBReader from "@tools/reader/reading/EPUBReader";
import { useBook } from "@tools/reader/queries";
import { useReadingSession } from "@tools/reader/reading/useReadingSession";
import { useHighlights } from "@tools/reader/reading/useHighlights";
import { useNotes } from "@tools/reader/reading/useNotes";
import type { ReadingPosition, CreateHighlightDto, HighlightResponse } from "@tools/reader/types";

export default function BookReaderPage() {
  const params = useParams();
  const router = useRouter();
  const bookId = params.id as string;

  const bookQuery = useBook(bookId);
  const book = bookQuery.data ?? null;
  const loading = bookQuery.isPending;
  const error = bookQuery.error ? bookQuery.error.message || "Failed to load book" : null;

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
  } = useHighlights({ bookId });

  // Initialize notes management
  const {
    notes,
    createNote,
    updateNote,
    deleteNote,
  } = useNotes({ bookId });

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
        notes={notes}
        onBackAction={handleBack}
        onPositionChange={handlePositionChange}
        onCreateNote={createNote}
        onUpdateNote={updateNote}
        onDeleteNote={deleteNote}
      />
    </div>
  );
}
