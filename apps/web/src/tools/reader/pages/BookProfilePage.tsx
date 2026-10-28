"use client";

import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import BookProfile from "@tools/reader/documents/BookProfile";
import { useBook, useBookNotes, useBookSummaries } from "@tools/reader/queries";
import { READER_ROUTES } from "@tools/reader/routes";

export default function BookProfilePage() {
  const params = useParams();
  const router = useRouter();
  const bookId = params.id as string;

  const book = useBook(bookId);
  const notes = useBookNotes(bookId);
  const summaries = useBookSummaries(bookId);

  const handleStartReading = () => {
    router.push(READER_ROUTES.bookReader(bookId));
  };

  const handleBack = () => {
    router.push(READER_ROUTES.library);
  };

  if (book.isPending) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Loading book...</span>
        </div>
      </div>
    );
  }

  if (book.error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-red-600 mb-2">Error</h1>
          <p className="text-muted-foreground">{book.error.message || "Failed to load book"}</p>
        </div>
      </div>
    );
  }

  if (!book.data) {
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

  return (
    <BookProfile
      book={book.data}
      notes={notes.data ?? []}
      summaries={summaries.data ?? []}
      onStartReading={handleStartReading}
      onBack={handleBack}
    />
  );
}
