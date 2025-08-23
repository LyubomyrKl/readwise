"use client";

import {useParams, useRouter} from "next/navigation";
import {useEffect, useState} from "react";
import {
    ArrowLeft,
    Clock,
    Loader2,
    Sparkles
} from "lucide-react";
import {IBook} from "../../../types";
import {apiFetch} from "@/lib/fetcher";

interface SummarySection {
  id: string;
  title: string;
  level: string;
  start_char: number;
  end_char: number;
  content: string;
  subsections?: SummarySection[];
}

interface Summary {
  sections: SummarySection[];
}

export default function BookSummaryPage() {
  const params = useParams();
  const router = useRouter();
  const bookId = params.id as string;

  const [book, setBook] = useState<IBook | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchBookAndSummary();
  }, [bookId]);

  const fetchBookAndSummary = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/books/${bookId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch book");
      }
      const bookInfo: IBook = await response.json();
      setBook(bookInfo);

      // Try to fetch summary
      await fetchSummary(bookId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load book");
    } finally {
      setLoading(false);
    }
  };

  const fetchSummary = async (bookId: string) => {
    try {
      const data = await apiFetch("POST", "/api/summarizer/get-summary", { bookId });
      setSummary(data.summary);
    } catch (err) {
      console.log("No summary found:", err);
      setSummary(null);
    }
  };

  const handleGenerateSummary = async () => {
    if (!book) return;

    try {
      await apiFetch("POST", "/api/summarizer", { bookId: book.id });
      // Refresh to get updated book status
      await fetchBookAndSummary();
    } catch (error) {
      console.error("Error generating summary:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to generate summary. Please try again.";
      alert(errorMessage);
    }
  };

  const renderSummaryContent = () => {
    if (!summary || !summary.sections) return null;

    return (
      <div className="space-y-6">
        {summary.sections.map((section, index) => (
          <div key={section.id || index} className="summary-section">
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                  {index + 1}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className={`font-semibold mb-3 ${
                  parseInt(section.level) === 1 ? 'text-2xl' : 
                  parseInt(section.level) === 2 ? 'text-xl' : 'text-lg'
                }`}>
                  {section.title}
                </h3>
                <div className="prose prose-lg max-w-none">
                  <p className="whitespace-pre-wrap leading-relaxed">
                    {section.content}
                  </p>
                </div>
                {section.subsections && section.subsections.length > 0 && (
                  <div className="mt-4 pl-6 border-l-2 border-border/20">
                    {section.subsections.map((subsection, subIndex) => (
                      <div key={subsection.id || subIndex} className="mb-4">
                        <h4 className="font-medium text-lg mb-2">
                          {subsection.title}
                        </h4>
                        <div className="prose max-w-none">
                          <p className="whitespace-pre-wrap">
                            {subsection.content}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderGenerateSummaryPage = () => (
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

  const renderProcessingPage = () => (
    <div className="h-full flex items-center justify-center p-8">
      <div className="max-w-md w-full text-center">
        <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
          <Loader2 className="w-12 h-12 text-primary animate-spin" />
        </div>
        <h2 className="text-2xl font-bold mb-4">Processing Summary</h2>
        <p className="text-muted-foreground mb-4 leading-relaxed">
          AI is analyzing the book content and generating your personalized summary. This usually takes 2-3 minutes.
        </p>
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Clock className="w-4 h-4" />
          <span>Please wait while we process...</span>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Loading book...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="max-w-md text-center p-8">
          <h2 className="text-xl font-semibold mb-4">Error</h2>
          <p className="text-muted-foreground mb-6">{error}</p>
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-muted/50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // Show processing if book is being summarized
  if (book?.summaryKey && !summary) {
    return renderProcessingPage();
  }

  // Show generate page if no summary exists
  if (!summary) {
    return renderGenerateSummaryPage();
  }

  return (
    <div className="py-8">
      <div className="max-w-4xl mx-auto">
        {renderSummaryContent()}
      </div>
    </div>
  );
}