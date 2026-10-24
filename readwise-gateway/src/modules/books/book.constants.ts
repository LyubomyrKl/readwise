export const BOOK_CONSTRAINTS = {
  // File size limits
  MAX_BOOK_SIZE: 1073741824, // 1GB
  MAX_COVER_SIZE: 10485760, // 10MB
  MIN_FILE_SIZE: 1,

  // Text length limits
  MAX_TITLE_LENGTH: 255,
  MAX_AUTHOR_LENGTH: 255,
  MAX_FILENAME_LENGTH: 255,
  MAX_DESCRIPTION_LENGTH: 1000,
  MAX_STORAGE_KEY_LENGTH: 500,

  // Validation patterns
  FILENAME_PATTERN: /^[^<>:"/\\|?*]+$/,
  COVER_MIME_PATTERN: /^image\/(jpeg|jpg|png|webp|gif)$/,

  MAX_PAGE_COUNT: 2555,
} as const;

export const BOOK_ERROR_MESSAGES = {
  INVALID_FILENAME: 'Invalid filename characters',
  COVER_FORMAT_NOT_SUPPORTED: 'Only image files allowed for covers',
  BOOK_NOT_FOUND: 'Book not found',
  BOOK_NOT_READY: 'Book not found or not ready for download',
  BOOK_ALREADY_FINALIZED: 'Book not found or already finalized',
  FILE_NOT_FOUND: 'File not found in storage',
  COVER_NOT_FOUND: 'Cover file not found in storage',
  PRESIGN_FAILED: 'Failed to generate presigned URL',
  BOOK_CREATION_FAILED: 'Failed to create book record',
  COVER_NOT_PREPARED_FOR_UPLOAD: 'Cover not prepared for upload',
} as const;

export const BOOK_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  READY: 'ready',
  ERROR: 'error',
} as const;

/**
 * Upper bound for a single multipart upload (book or cover), enforced by multer.
 * Override with UPLOAD_MAX_FILE_BYTES; defaults to BOOK_CONSTRAINTS.MAX_BOOK_SIZE.
 */
export const UPLOAD_MAX_FILE_BYTES = (() => {
  const fromEnv = Number(process.env.UPLOAD_MAX_FILE_BYTES);
  return Number.isFinite(fromEnv) && fromEnv > 0
    ? fromEnv
    : BOOK_CONSTRAINTS.MAX_BOOK_SIZE;
})();
