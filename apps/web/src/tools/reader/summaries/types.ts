/** Shape of the summary JSON the workers store in the summaries bucket. */

export interface Chunk {
  chunk_id: string;
  content: string;
  original_tokens: number;
  summary_tokens: number;
}

export interface SectionSummary {
  content: string;
  token_count: number;
  entities: unknown[];
}

export interface SummarySection {
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
