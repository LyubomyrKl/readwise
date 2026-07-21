import type { BookResponse } from "./books";

// Summary Types
export type SummaryType = 'extractive' | 'abstractive';

export const SUMMARY_TYPES: { value: SummaryType; label: string; description: string }[] = [
  {
    value: 'extractive',
    label: 'Extractive',
    description: 'Extracts key sentences directly from the text'
  },
  {
    value: 'abstractive',
    label: 'Abstractive',
    description: 'Generates new text that paraphrases the content'
  },
];

// Summarization Strategies
export type SummarizationStrategy = 'basic' | 'structured' | 'two_pass' | 'chain_of_density' | 'hybrid';

export const SUMMARIZATION_STRATEGIES: { value: SummarizationStrategy; label: string; description: string }[] = [
  {
    value: 'basic',
    label: 'Basic',
    description: 'Simple and fast summarization'
  },
  {
    value: 'structured',
    label: 'Structured',
    description: 'Better prompts with strict constraints (recommended)'
  },
  {
    value: 'two_pass',
    label: 'Two-Pass',
    description: 'Extracts key info, then synthesizes (best factuality)'
  },
  {
    value: 'chain_of_density',
    label: 'Chain of Density',
    description: 'Progressive density increase (most information-dense)'
  },
  {
    value: 'hybrid',
    label: 'Hybrid',
    description: 'Extractive then abstractive (best for technical content)'
  },
];

// Summarizer Request DTOs
export interface RequestSummaryDto {
  bookId: string;
  summaryType?: SummaryType;
  summarizationStrategy?: SummarizationStrategy;
}

export interface GetSummaryDto {
  bookId: string;
}

// Summarizer Response Types
export interface SummarySubsection {
  id: string;
  title: string;
  level: string;
  start_char: number;
  end_char: number;
  content: string;
}

export interface SummarySection {
  id: string;
  title: string;
  level: string;
  start_char: number;
  end_char: number;
  content: string;
  subsections?: SummarySubsection[];
}

export interface Summary {
  sections: SummarySection[];
}

export interface SummaryResponse extends BookResponse {
  summary: Summary;
}

export interface SummaryRequestResponse {
  bookId: string;
  status: string;
}

export interface SummaryStatusResponse {
  status: 'pending' | 'processing' | 'ready' | 'error';
  bookId: string;
  isReady: boolean;
  summaryKey?: string;
}
