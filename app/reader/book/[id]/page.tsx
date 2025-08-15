"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Loader2 } from "lucide-react";
import PDFReader from "./components/PDFReader";

export default function BookReaderPage() {
  const params = useParams();
  const bookId = params.id as string;

  const [book, setBook] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return <PDFReader book={book} />;
}
