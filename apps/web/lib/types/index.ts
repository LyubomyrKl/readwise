// Auth types
export type {
  LoginDto,
  RegisterDto,
  RefreshDto,
  SafeUser,
  Tokens,
  AuthBundle,
  MePayload,
  LogoutResult,
} from "./auth";

// Book types
export type {
  UpdateSpentTimeDto,
  SetBookToFavoriteDto,
  UpdateLastAccessedDto,
  BookResponse,
  ReadingPosition,
  UpdateReadingPositionDto,
  HighlightAnchor,
  CreateHighlightDto,
  UpdateHighlightDto,
  HighlightResponse,
  NoteAnchor,
  CreateNoteDto,
  UpdateNoteDto,
  NoteResponse,
} from "./books";

// Summarizer types
export type {
  SummaryType,
  SummarizationStrategy,
  RequestSummaryDto,
  GetSummaryDto,
  SummarySubsection,
  SummarySection,
  Summary,
  SummaryResponse,
  SummaryRequestResponse,
  SummaryStatusResponse,
  JobStatus,
} from "./summarizer";

export { SUMMARY_TYPES, SUMMARIZATION_STRATEGIES } from "./summarizer";
