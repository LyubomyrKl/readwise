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
  // Export/Import types
  ExportCardData,
  ExportNoteData,
  ExportStatistics,
  ExportSettings,
  LearningExportResponse,
  ImportCardData,
  ImportNoteData,
  ImportLearningDataDto,
  ImportResultResponse,
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
  // Synonym groups
  CreateSynonymGroupDto,
  UpdateSynonymGroupDto,
  AddEntriesToSynonymGroupDto,
  SynonymEntryResponse,
  SynonymGroupResponse,
  SynonymGroupSummaryResponse,
} from "./dictionary";
