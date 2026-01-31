import type { BookResponse } from "./books";

// Summarizer Request DTOs
export interface RequestSummaryDto {
  bookId: string;
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
