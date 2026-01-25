// Upload file status enum for type safety
export type UploadStatus =
  | "queued"
  | "uploading"
  | "processing"
  | "paused"
  | "completed"
  | "error";

// Error codes for specific error handling
export type UploadErrorCode =
  | "FILE_TOO_LARGE"
  | "INVALID_FORMAT"
  | "NETWORK_ERROR"
  | "SERVER_ERROR"
  | "TIMEOUT"
  | "CANCELLED"
  | "UNKNOWN";

// File metadata extracted before upload
export interface UploadFileMetadata {
  title: string;
  author: string;
  description?: string;
  fileName: string;
  mime: string;
  sizeBytes: number;
  pageCount?: number | null;
  customCoverFilename?: string;
  customCoverMime?: string;
}

// Input file for upload with all metadata and file blob
export interface UploadFile extends UploadFileMetadata {
  file: File;
  coverFile?: File;
  coverPreview?: string;
}

// Extended upload progress tracking
export interface UploadProgress {
  id: string;
  file: UploadFile;
  title: string;
  author: string;
  name: string;
  size: number;
  cover?: string;
  status: UploadStatus;
  progress: number;
  error?: string;
  errorCode?: UploadErrorCode;
  bookId?: string;
  storageKey?: string;
  coverStorageKey?: string;
  // Enhanced tracking
  bytesUploaded: number;
  startTime?: number;
  speed?: number; // bytes per second
  eta?: number; // seconds remaining
  retryCount: number;
  queuePosition?: number;
  // XHR reference for cancellation
  xhr?: XMLHttpRequest;
}

// Batch upload statistics
export interface UploadStats {
  total: number;
  queued: number;
  uploading: number;
  completed: number;
  failed: number;
  paused: number;
  totalBytes: number;
  uploadedBytes: number;
  overallProgress: number;
  averageSpeed: number;
  estimatedTimeRemaining: number;
}

// Context type for the upload provider
export interface UploadContextType {
  // State
  uploads: UploadProgress[];
  stats: UploadStats;
  isPaused: boolean;
  maxConcurrent: number;

  // Actions
  addUploads: (files: UploadFile[]) => void;
  removeUpload: (id: string) => void;
  cancelUpload: (id: string) => void;
  retryUpload: (id: string) => void;
  pauseUpload: (id: string) => void;
  resumeUpload: (id: string) => void;

  // Batch actions
  pauseAll: () => void;
  resumeAll: () => void;
  cancelAll: () => void;
  retryAllFailed: () => void;
  clearCompleted: () => void;
  clearAll: () => void;

  // Configuration
  setMaxConcurrent: (max: number) => void;
}

// Validation result for pre-upload checks
export interface ValidationResult {
  valid: boolean;
  errors: Array<{
    file: File;
    reason: "too_large" | "invalid_type" | "name_too_long" | "duplicate";
    message: string;
  }>;
  validFiles: File[];
}

// Constants
export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
export const MAX_FILENAME_LENGTH = 255;
export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/epub+zip",
  "text/plain",
];
export const ALLOWED_EXTENSIONS = [".pdf", ".epub", ".txt"];
export const DEFAULT_MAX_CONCURRENT = 3;
export const MAX_RETRIES = 2;
export const RETRY_DELAY_MS = 2000;
