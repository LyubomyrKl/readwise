// ===== Enums =====

export type CardType = 'recognition' | 'production' | 'cloze';
export type CardState = 'new' | 'learning' | 'review' | 'relearning';
export type ReviewRating = 'again' | 'hard' | 'good' | 'easy';
export type NoteSourceType = 'manual' | 'highlight' | 'ai_generated';

// ===== DTOs =====

export interface CreateLearningNoteDto {
  targetSentence: string;
  meaning: string;
  targetWord: string;
  notes?: string;
  alternativePhrasing?: string;
  bookId?: string;
  highlightId?: string;
  dictionaryEntryId?: string;
}

export interface UpdateLearningNoteDto {
  targetSentence?: string;
  meaning?: string;
  targetWord?: string;
  notes?: string;
  alternativePhrasing?: string;
  isArchived?: boolean;
}

export interface ValidateNoteDto {
  targetSentence: string;
  meaning: string;
  targetWord: string;
}

export interface SubmitReviewDto {
  cardId: string;
  rating: ReviewRating;
  responseTimeMs: number;
  wasHesitant?: boolean;
}

export interface EndSessionDto {
  sessionId: string;
  totalTimeMs: number;
}

export interface UpdateSettingsDto {
  generateRecognition?: boolean;
  generateProduction?: boolean;
  generateCloze?: boolean;
  newCardsPerDay?: number;
  maxReviewsPerDay?: number;
  showResponseTime?: boolean;
  enforceProduction?: boolean;
  requireTyping?: boolean;
}

// ===== Response Types =====

export interface ValidationResultResponse {
  isValid: boolean;
  warnings: string[];
  errors: string[];
}

export interface LearningCardResponse {
  id: string;
  noteId: string;
  cardType: CardType;
  front: string;
  back: string;
  clozeIndex?: number | null;
  state: CardState;
  dueAt: string;
  difficulty: number;
  lapseCount: number;
}

export interface LearningNoteResponse {
  id: string;
  userId: string;
  bookId?: string | null;
  highlightId?: string | null;
  targetSentence: string;
  meaning: string;
  targetWord: string;
  notes?: string | null;
  alternativePhrasing?: string | null;
  sourceType: NoteSourceType;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  cards: LearningCardResponse[];
}

export interface StudyQueueResponse {
  newCards: LearningCardResponse[];
  reviewCards: LearningCardResponse[];
  learningCards: LearningCardResponse[];
  totalDue: number;
  newAvailable: number;
  reviewsAvailable: number;
}

export interface SessionStartResponse {
  sessionId: string;
  startedAt: string;
}

export interface ReviewResultResponse {
  cardId: string;
  newDifficulty: number;
  newStability: number;
  newState: CardState;
  intervalDays: number;
  nextDueAt: string;
}

export interface StatsResponse {
  retentionRate: number;
  matureVocabulary: number;
  youngVocabulary: number;
  newCards: number;
  productionAccuracy: number;
  estimatedUsableVocabulary: number;
  dailyCognitiveLoad: number;
  currentStreak: number;
  reviewsForecast: number[];
  imbalanceWarning?: string;
}

export interface DailyStatsResponse {
  date: string;
  newCardsStudied: number;
  reviewsCompleted: number;
  correctCount: number;
  incorrectCount: number;
  timeSpentMs: number;
}

export interface SettingsResponse {
  generateRecognition: boolean;
  generateProduction: boolean;
  generateCloze: boolean;
  newCardsPerDay: number;
  maxReviewsPerDay: number;
  showResponseTime: boolean;
  enforceProduction: boolean;
  requireTyping: boolean;
}

// ===== Export/Import Types =====

export interface ExportCardData {
  cardType: CardType;
  front: string;
  back: string;
  state: CardState;
  difficulty: number;
  stability: number;
  reviewCount: number;
  clozeIndex?: number | null;
}

export interface ExportNoteData {
  targetSentence: string;
  meaning: string;
  targetWord: string;
  notes?: string | null;
  alternativePhrasing?: string | null;
  sourceType: NoteSourceType;
  createdAt: string;
  cards: ExportCardData[];
}

export interface ExportStatistics {
  totalNotes: number;
  matureVocabulary: number;
  retentionRate: number;
}

export interface ExportSettings {
  generateRecognition: boolean;
  generateProduction: boolean;
  generateCloze: boolean;
  newCardsPerDay: number;
  maxReviewsPerDay: number;
}

export interface LearningExportResponse {
  version: string;
  exportedAt: string;
  statistics: ExportStatistics;
  notes: ExportNoteData[];
  settings: ExportSettings;
}

export interface ImportCardData {
  cardType: CardType;
  front: string;
  back: string;
  state: CardState;
  difficulty: number;
  stability: number;
  reviewCount: number;
  clozeIndex?: number | null;
}

export interface ImportNoteData {
  targetSentence: string;
  meaning: string;
  targetWord: string;
  notes?: string | null;
  alternativePhrasing?: string | null;
  sourceType: NoteSourceType;
  createdAt: string;
  cards: ImportCardData[];
}

export interface ImportLearningDataDto {
  version: string;
  notes: ImportNoteData[];
  skipExisting?: boolean;
}

export interface ImportResultResponse {
  imported: number;
  skipped: number;
  errors: number;
  errorMessages: string[];
}
