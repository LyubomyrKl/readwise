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
} from "./summarizer";

export { SUMMARY_TYPES, SUMMARIZATION_STRATEGIES } from "./summarizer";

// Learning types
export type {
  CardType,
  CardState,
  ReviewRating,
  NoteSourceType,
  CreateLearningNoteDto,
  UpdateLearningNoteDto,
  ValidateNoteDto,
  SubmitReviewDto,
  EndSessionDto,
  UpdateSettingsDto,
  ValidationResultResponse,
  LearningCardResponse,
  LearningNoteResponse,
  StudyQueueResponse,
  SessionStartResponse,
  ReviewResultResponse,
  StatsResponse,
  DailyStatsResponse,
  SettingsResponse,
} from "./learning";

// Dictionary types
export type {
  CreateCollocationDto,
  CreateDictionaryEntryDto,
  UpdateDictionaryEntryDto,
  DictionarySearchQuery,
  CollocationResponse,
  DictionaryEntryResponse,
  DictionaryStatsResponse,
  DictionarySearchResult,
  CreateSemanticGroupDto,
  UpdateSemanticGroupDto,
  AddEntryToGroupsDto,
  SemanticGroupResponse,
  RelatedWordResponse,
  WordWithRelatedResponse,
} from "./dictionary";
