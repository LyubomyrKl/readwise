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

/** The latest finished summary of a book (POST /api/summarizer/get-summary). */
export interface SummaryResponse {
  bookId: string;
  summaryId: string;
  summaryType: SummaryType;
  summarizationStrategy: SummarizationStrategy;
  summaryKey: string;
  createdAt: string;
  summary: Summary;
}

export interface SummaryRequestResponse {
  success: boolean;
  message: string;
  userId: string;
  bookId: string;
  /** Storage key when a matching summary already exists. */
  summaryKey?: string;
  summaryId?: string;
  /** The reader.summarize job; GET /api/jobs/:id for details. */
  jobId?: string;
}

export type JobStatus = 'queued' | 'running' | 'waiting' | 'succeeded' | 'failed' | 'cancelled';

export interface SummaryStatusResponse {
  /** processing while a job is active, ready when a summary exists, error after a final failure */
  status: 'processing' | 'ready' | 'error';
  bookId: string;
  isReady: boolean;
  summaryKey?: string;
  /** Type of the stored summary, once ready. */
  summaryType?: SummaryType;
  /** Strategy that produced the stored summary, once ready. */
  summarizationStrategy?: SummarizationStrategy;
  /** Last processing error, present when status is "error". */
  errorMessage?: string | null;
  summaryId?: string;
  jobId?: string;
  jobStatus?: JobStatus;
  /** Real pipeline stage, e.g. "section 3/12". */
  stage?: string | null;
  /** 0-100 */
  progress?: number;
  /** Why the job waits, e.g. the LLM host is unreachable. */
  waitReason?: string | null;
}
