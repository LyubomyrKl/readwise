export interface PendingFile {
  id: string;
  file: File;
  title: string;
  author: string;
  description: string;
  pageCount: number | null;
  isParsingMetadata: boolean;
  extractedCover?: string;
  coverFile?: File;
  coverPreview?: string;
  isExpanded?: boolean;
}
