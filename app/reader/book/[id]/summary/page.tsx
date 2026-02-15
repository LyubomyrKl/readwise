"use client";

import {useParams} from "next/navigation";
import {useEffect, useState, useRef} from "react";
import {IBook} from "../../../types";
import {apiFetch} from "@/lib/fetcher";
import { ErrorState, Loader, Processing, SummaryReader, GenerateSummaryState} from './(components)';

interface Chunk {
  chunk_id: string;
  content: string;
  original_tokens: number;
  summary_tokens: number;
}

interface SectionSummary {
  content: string;
  token_count: number;
  entities: unknown[];
}

interface SummarySection {
  id: string;
  title: string;
  level: string;
  start_char: number;
  end_char: number;
  content?: string;
  subsections?: SummarySection[];
  chunks?: Chunk[];
  chunk_ids?: string[];
  summary?: SectionSummary;
}

export interface Summary {
  sections: SummarySection[];
  document_summary?: SectionSummary;
}

export default function BookSummaryPage() {
  const params = useParams();
  const bookId = params.id as string;

  const [book, setBook] = useState<IBook | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current || !bookId) return;
    fetchedRef.current = true;
    void fetchSummary(bookId);
  }, [bookId]);

  const fetchSummary = async (bookId: string) => {
    try {
      setLoading(true)
      const {summary, ...bookInfo} = await apiFetch("POST", "/api/summarizer/get-summary", { bookId });
      setSummary(summary);
      setBook(bookInfo)
    } catch (err) {
      const error = err as Error;

      setError(error.message);

      setSummary(null);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Loader/>

  if (error)  return <ErrorState error={error}/>

  // Show processing UI when summary is being generated
  const isProcessing = book?.status === 'processing' || (book?.summaryKey && !summary);
  if (isProcessing) {
    return (
      <Processing
        bookId={bookId}
        onComplete={() => {
          fetchedRef.current = false;
          void fetchSummary(bookId);
        }}
        onError={(err) => setError(err)}
      />
    );
  }

  if (!summary || !summary.sections) {
    return <GenerateSummaryState
      book={book}
      setError={setError}
      setBookProcessing={(book) => {
        setBook(() => ({...book, status: 'processing'}))
      }}
    />
  }

  return <SummaryReader summary={summary} />;
}