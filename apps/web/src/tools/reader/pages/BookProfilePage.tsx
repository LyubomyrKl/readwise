"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { Loader2 } from "lucide-react";
import BookProfile from "@tools/reader/documents/BookProfile";
import { IBook } from "@tools/reader/types";
import { apiFetch } from "@/lib/fetcher";
import type { NoteResponse } from "@/lib/types";

import { READER_ROUTES } from "@tools/reader/routes";
export default function BookProfilePage() {
  const params = useParams();
  const router = useRouter();
  const bookId = params.id as string;

  const [book, setBook] = useState<IBook | null>(null);
  const [notes, setNotes] = useState<NoteResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current || !bookId) return;
    fetchedRef.current = true;

    async function fetchBook() {
      try {
        setLoading(true);
        const [response, bookNotes] = await Promise.all([
          apiFetch("GET", "/api/books/[id]", undefined, { id: bookId }),
          apiFetch("GET", "/api/books/[id]/notes", undefined, { id: bookId }).catch(() => [] as NoteResponse[]),
        ]);
        setBook(response.data);
        setNotes(bookNotes);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load book");
      } finally {
        setLoading(false);
      }
    }

    fetchBook();
  }, [bookId]);

  const handleStartReading = () => {
    router.push(READER_ROUTES.bookReader(bookId));
  };

  const handleBack = () => {
    router.push(READER_ROUTES.library);
  };

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

  return (
    <BookProfile
      book={book}
      notes={notes}
      onStartReading={handleStartReading}
      onBack={handleBack}
    />
  );
}
