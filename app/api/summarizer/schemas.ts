import type {
  RequestSummaryDto,
  GetSummaryDto,
  SummaryRequestResponse,
} from "@satoru-satoshi/summarize-api-sdk";
import type { BookResponse } from "@/app/api/books/schemas";

// Re-export SDK types for convenience
export type {
  RequestSummaryDto as SummarizeReqType,
  GetSummaryDto as GetSummaryReqType,
  SummaryRequestResponse as SummarizeResType,
};

// Summary section structure
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

// Extended SummaryResponse with correct types
export interface SummaryResponse extends BookResponse {
  summary: Summary;
}

export type GetSummaryResType = SummaryResponse;
