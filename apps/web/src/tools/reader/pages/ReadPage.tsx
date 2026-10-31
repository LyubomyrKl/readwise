"use client";

import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { useCallback } from "react";
import { Loader2 } from "lucide-react";
import { useBook } from "@tools/reader/queries";
import { useReadingSession } from "@tools/reader/reading/useReadingSession";
import { useHighlights } from "@tools/reader/reading/useHighlights";
import { useNotes } from "@tools/reader/reading/useNotes";
import { formatOf } from "@tools/reader/reading/engines/createEngine";
import { toLocator, type Locator } from "@tools/reader/reading/locator";

// the shell loads PDF.js or foliate-js on demand; nothing of it runs on the server
const ReaderShell = dynamic(() => import("@tools/reader/reading/shell/ReaderShell"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin" aria-label="Opening the reader" />
    </div>
  ),
});

export default function BookReaderPage() {
  const params = useParams();
  const router = useRouter();
  const bookId = params.id as string;

  const bookQuery = useBook(bookId);
  const book = bookQuery.data ?? null;
  const format = book ? formatOf(book.mime, book.fileUrl) : "epub";

  // the stored position may still be v1; the session saves v2 from the first move on
  const { setPosition, forceSave } = useReadingSession({
    bookId,
    initialPosition: book ? toLocator(book.readingPosition, format) : null,
    autoSaveInterval: 30_000,
    // only once the book is in: this visit's own update must not race the request that loads it
    updateLastAccessedOnMount: !!book,
  });
  const { highlights, createHighlight, updateHighlight, deleteHighlight } = useHighlights({ bookId });
  const { notes, createNote, updateNote, deleteNote } = useNotes({ bookId });

  const handleBack = useCallback(async () => {
    await forceSave();
    router.back();
  }, [forceSave, router]);

  const handlePositionChange = useCallback((locator: Locator) => setPosition(locator), [setPosition]);

  if (bookQuery.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Loading book...</span>
        </div>
      </div>
    );
  }

  if (bookQuery.error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="mb-2 text-xl font-semibold text-red-600">Error</h1>
          <p className="text-muted-foreground">{bookQuery.error.message || "Failed to load book"}</p>
        </div>
      </div>
    );
  }

  if (!book) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="mb-2 text-xl font-semibold">Book not found</h1>
          <p className="text-muted-foreground">The requested book could not be found.</p>
        </div>
      </div>
    );
  }

  return (
    <ReaderShell
      book={book}
      startPosition={book.readingPosition ?? null}
      highlights={highlights}
      notes={notes}
      onBack={handleBack}
      onPositionChange={handlePositionChange}
      onCreateHighlight={createHighlight}
      onUpdateHighlight={updateHighlight}
      onDeleteHighlight={deleteHighlight}
      onCreateNote={createNote}
      onUpdateNote={updateNote}
      onDeleteNote={deleteNote}
    />
  );
}
