// Re-export types from centralized location
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
  BookResponse,
  TransformedPresignRes,
  TransformedCoverPresignRes,
} from "@/lib/types";
