"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { IBook } from "@tools/reader/types";
import { apiFetch } from "@/lib/fetcher";
import type { Summary } from "@tools/reader/summaries/types";
import { ErrorState, Loader, Processing, SummaryReader, GenerateSummaryState } from "@tools/reader/summaries";

/**
 * The book decides what to show: a finished summary is loaded and rendered,
 * an active job shows the progress screen, otherwise the user can start one.
 * The book's `status` and `summaryKey` are the compatibility fields the API
 * derives from the latest summary job (see SummariesService).
 */
export default function BookSummaryPage() {
  const params = useParams();
  const bookId = params.id as string;

  const [book, setBook] = useState<IBook | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data: loadedBook } = await apiFetch("GET", "/api/books/[id]", undefined, { id: bookId });
      setBook(loadedBook);
      if (loadedBook.summaryKey) {
        const { summary: loadedSummary } = await apiFetch("POST", "/api/summarizer/get-summary", { bookId });
        setSummary(loadedSummary);
      } else {
        setSummary(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load the summary");
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [bookId]);

  useEffect(() => {
    if (!bookId) return;
    void load();
  }, [bookId, load]);

  if (loading) return <Loader />;

  if (error) return <ErrorState error={error} />;

  if (summary && summary.sections) {
    return <SummaryReader summary={summary} />;
  }

  if (book?.status === "processing") {
    return (
      <Processing
        bookId={bookId}
        onComplete={() => void load()}
        onError={(err) => setError(err)}
      />
    );
  }

  return (
    <GenerateSummaryState
      book={book}
      setError={setError}
      setBookProcessing={(processing) => setBook({ ...processing, status: "processing" })}
    />
  );
}
