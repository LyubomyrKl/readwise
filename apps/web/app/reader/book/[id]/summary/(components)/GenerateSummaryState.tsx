import React, { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/fetcher';
import { IBook } from '@/app/reader/types';
import {
  SummaryType,
  SummarizationStrategy,
  SUMMARY_TYPES,
  SUMMARIZATION_STRATEGIES
} from '@/lib/types';

interface SummaryProps {
  book: IBook | null;
  setBookProcessing: (book: IBook) => void;
  setError: (error: string) => void;
}

// Only these strategies support extractive mode
const STRATEGIES_WITH_EXTRACTIVE: SummarizationStrategy[] = ['basic', 'structured'];

export const GenerateSummaryState = ({book, setBookProcessing, setError}: SummaryProps) => {
  const [summaryType, setSummaryType] = useState<SummaryType>('abstractive');
  const [strategy, setStrategy] = useState<SummarizationStrategy>('structured');
  const [isGenerating, setIsGenerating] = useState(false);

  // Check if current strategy supports extractive mode
  const supportsExtractiveMode = STRATEGIES_WITH_EXTRACTIVE.includes(strategy);

  const handleStrategyChange = (newStrategy: SummarizationStrategy) => {
    setStrategy(newStrategy);
    // Auto-switch to abstractive if the new strategy doesn't support extractive
    if (!STRATEGIES_WITH_EXTRACTIVE.includes(newStrategy) && summaryType === 'extractive') {
      setSummaryType('abstractive');
    }
  };

  const handleGenerateSummary = async () => {
    if (!book) return;

    setIsGenerating(true);
    try {
      setBookProcessing(book);

      await apiFetch("POST", "/api/summarizer", {
        bookId: book.id,
        summaryType,
        summarizationStrategy: strategy,
      });

      toast.success("Summary generation started");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to generate summary. Please try again.";
      setError(message);
      toast.error(message);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="max-w-2xl w-full text-center">
        <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
          <Sparkles className="w-12 h-12 text-primary" />
        </div>
        <h2 className="text-2xl font-bold mb-4">Generate Summary</h2>
        <p className="text-muted-foreground mb-6 leading-relaxed">
          Create an AI-powered summary of this book with key insights, main themes, and important takeaways.
        </p>

        {/* Strategy Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-muted-foreground mb-3">
            Summarization Strategy
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {SUMMARIZATION_STRATEGIES.map((s) => (
              <button
                key={s.value}
                onClick={() => handleStrategyChange(s.value)}
                className={`p-3 rounded-lg border-2 transition-all text-left ${
                  strategy === s.value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <div className="font-medium text-sm">{s.label}</div>
                <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{s.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Summary Type Selection - only shown for strategies that support it */}
        {supportsExtractiveMode && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-muted-foreground mb-3">
              Summary Type
            </label>
            <div className="flex gap-3 justify-center">
              {SUMMARY_TYPES.map((type) => (
                <button
                  key={type.value}
                  onClick={() => setSummaryType(type.value)}
                  className={`flex-1 max-w-[160px] p-3 rounded-lg border-2 transition-all ${
                    summaryType === type.value
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="font-medium text-sm">{type.label}</div>
                  <div className="text-xs text-muted-foreground mt-1">{type.description}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={handleGenerateSummary}
          disabled={isGenerating}
          className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGenerating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          {isGenerating ? "Starting..." : "Generate Summary"}
        </button>
      </div>
    </div>
  );
};

