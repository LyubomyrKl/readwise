import React from 'react';
import { Sparkles } from 'lucide-react';
import { apiFetch } from '@/lib/fetcher';
import { IBook } from '@/app/reader/types';

interface SummaryProps {
  book: IBook | null;
  setBookProcessing: (book: IBook) => void;
  setError: (error: string) => void;
}

export const GenerateSummaryState = ({book, setBookProcessing, setError}: SummaryProps) => {
  const handleGenerateSummary = async () => {
    if (!book) return;

    try {
      setBookProcessing(book);

      await apiFetch("POST", "/api/summarizer", { bookId: book.id });

    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to generate summary. Please try again.");
    }
  };

  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="max-w-md w-full text-center">
        <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
          <Sparkles className="w-12 h-12 text-primary" />
        </div>
        <h2 className="text-2xl font-bold mb-4">Generate Summary</h2>
        <p className="text-muted-foreground mb-8 leading-relaxed">
          Create an AI-powered summary of this book with key insights, main themes, and important takeaways.
        </p>
        <button
          onClick={handleGenerateSummary}
          className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
        >
          <Sparkles className="w-4 h-4" />
          Generate Summary
        </button>
      </div>
    </div>
  );
};

