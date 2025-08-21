"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { ArrowLeft, BookOpen, Loader2, Sparkles, Clock } from "lucide-react";
import { IBook } from "../../../types";

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

type SummaryStatus = 'none' | 'processing' | 'ready' | 'failed';

export default function BookSummaryPage() {
  const params = useParams();
  const router = useRouter();
  const bookId = params.id as string;

  const [book, setBook] = useState<IBook | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [summaryStatus, setSummaryStatus] = useState<SummaryStatus>('none');
  const [error, setError] = useState<string | null>(null);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchBookAndSummary();
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [bookId]);

  const fetchBookAndSummary = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/books/${bookId}`);
      
      if (!response.ok) {
        throw new Error("Failed to fetch book");
      }

      const bookData = await response.json();
      const bookInfo: IBook = bookData.data;
      setBook(bookInfo);

      // Check summary status based on book data
      if (bookInfo.summaryKey) {
        const summaryResult = await fetchSummary(bookInfo.summaryKey);
        if (summaryResult) {
          setSummaryStatus('ready');
        } else {
          // summaryKey exists but no summary found - it might be processing
          // Only start polling if we're currently in processing state
          if (summaryStatus === 'processing') {
            startPolling();
          } else {
            setSummaryStatus('none'); // Reset if not actively processing
          }
        }
      } else {
        setSummaryStatus('none');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load book");
    } finally {
      setLoading(false);
    }
  };

  const fetchSummary = async (summaryKey: string): Promise<boolean> => {
    try {
      const response = await fetch("/api/summarizer/get-summary", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ summaryKey }),
      });

      if (response.ok) {
        const data = await response.json();
        setSummary(data.summary);
        return true;
      }
      return false;
    } catch (err) {
      console.log("Failed to fetch summary:", err);
      return false;
    }
  };

  const startPolling = useCallback(() => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
    }

    const interval = setInterval(async () => {
      if (!book?.summaryKey) return;

      const summaryReady = await fetchSummary(book.summaryKey);
      if (summaryReady) {
        setSummaryStatus('ready');
        clearInterval(interval);
        setPollingInterval(null);
      }
    }, 3000); // Poll every 3 seconds

    setPollingInterval(interval);

    // Stop polling after 5 minutes
    setTimeout(() => {
      clearInterval(interval);
      setPollingInterval(null);
      if (summaryStatus === 'processing') {
        setSummaryStatus('failed');
      }
    }, 300000);
  }, [book?.summaryKey, summaryStatus]);

  const handleGenerateSummary = async () => {
    if (!book) return;

    setSummaryStatus('processing');
    try {
      const response = await fetch("/api/summarizer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ bookId: book.id }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate summary");
      }

      // Start polling immediately after successful generation request
      startPolling();
      
      // Also refresh book data to get updated summaryKey
      setTimeout(() => {
        fetchBookAndSummary();
      }, 2000);
    } catch (error) {
      console.error("Error generating summary:", error);
      setSummaryStatus('failed');
      alert("Failed to generate summary. Please try again.");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        <span>Loading...</span>
      </div>
    );
  }

  if (error || !book) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-red-600 mb-2">Error</h1>
          <p className="text-muted-foreground">{error || "Book not found"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm">Back</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Book Header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="w-16 h-20 bg-muted rounded-lg flex items-center justify-center">
            {book.coverUrl ? (
              <img
                src={book.coverUrl}
                alt={book.title}
                className="w-full h-full object-cover rounded-lg"
              />
            ) : (
              <BookOpen className="h-8 w-8 text-muted-foreground" />
            )}
          </div>
          <div>
            <h1 className="text-2xl font-bold">{book.title}</h1>
            <p className="text-muted-foreground">by {book.author}</p>
          </div>
        </div>

        {summaryStatus === 'none' && (
          // No Summary State
          <div className="text-center py-12">
            <Sparkles className="h-16 w-16 text-purple-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">No Summary Available</h2>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Generate an AI-powered summary to get key insights and chapter breakdowns.
            </p>
            <button
              onClick={handleGenerateSummary}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-lg font-medium"
            >
              <Sparkles className="h-4 w-4" />
              Generate Summary
            </button>
          </div>
        )}

        {summaryStatus === 'processing' && (
          // Processing State
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Loader2 className="h-8 w-8 text-purple-500 animate-spin" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Generating Summary</h2>
            <p className="text-muted-foreground mb-4">
              AI is analyzing your book and creating a comprehensive summary...
            </p>
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>This usually takes 2-5 minutes</span>
            </div>
          </div>
        )}

        {summaryStatus === 'failed' && (
          // Failed State
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Sparkles className="h-8 w-8 text-red-500" />
            </div>
            <h2 className="text-xl font-semibold mb-2 text-red-600">Summary Generation Failed</h2>
            <p className="text-muted-foreground mb-6">
              Something went wrong while generating the summary. Please try again.
            </p>
            <button
              onClick={handleGenerateSummary}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-lg font-medium"
            >
              <Sparkles className="h-4 w-4" />
              Try Again
            </button>
          </div>
        )}

        {summaryStatus === 'ready' && summary && (
          // Summary Display
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Summary</h2>
              <button
                onClick={() => {
                  setSummaryStatus('processing');
                  handleGenerateSummary();
                }}
                className="text-sm text-purple-600 hover:text-purple-700"
              >
                Regenerate
              </button>
            </div>

            {summary.sections.map((section) => (
              <div key={section.id} className="border rounded-lg p-6 bg-white">
                <h3 className="text-lg font-semibold mb-2">{section.title}</h3>
                <div className="text-sm text-muted-foreground mb-4">
                  {section.level} • {section.end_char - section.start_char} characters
                </div>
                <p className="text-gray-700 leading-relaxed mb-4">{section.content}</p>

                {section.subsections && section.subsections.length > 0 && (
                  <div className="pl-4 border-l-2 border-gray-200 space-y-4">
                    {section.subsections.map((subsection) => (
                      <div key={subsection.id} className="bg-gray-50 rounded-lg p-4">
                        <h4 className="font-medium mb-2">{subsection.title}</h4>
                        <div className="text-sm text-muted-foreground mb-2">
                          {subsection.level} • {subsection.end_char - subsection.start_char} characters
                        </div>
                        <p className="text-gray-600 text-sm">{subsection.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}