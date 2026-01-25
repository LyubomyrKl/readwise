import type {
  CreateBookDto,
  FinalizeBookDto,
  FinalizeCoverDto,
  PresignedUploadDto,
  CoverUpdateDto,
  UpdateSpentTimeDto,
  PresignResponse,
  FinalizeResponse,
  CoverPresignResponse,
  BookResponse,
} from "@satoru-satoshi/summarize-api-sdk";

// Re-export SDK DTO types for requests
export type {
  CreateBookDto as PresignReqType,
  FinalizeBookDto as FinalizeReqType,
  FinalizeCoverDto as FinalizeCoverReqType,
  PresignedUploadDto as CoverPresignReqType,
  CoverUpdateDto as UpdateCoverFinalizeReqType,
  UpdateSpentTimeDto as UpdateSpentTimeReqType,
  PresignResponse as PresignResType,
  FinalizeResponse as FinalizeResType,
  CoverPresignResponse as CoverPresignResType,
  BookResponse as BookResponse,
};

// Type for the transformed presign response used by frontend
export type TransformedPresignRes = {
  bookId: string;
  storageKey: string;
  upload: {
    url: string;
    headers: Record<string, string>;
  };
  coverStorageKey?: string;
  coverUpload?: {
    url: string;
    headers: Record<string, string>;
  };
};

// Type for transformed cover presign response
export type TransformedCoverPresignRes = {
  storageKey: string;
  upload: {
    url: string;
    headers: Record<string, string>;
  };
};
