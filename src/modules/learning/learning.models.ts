import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsNumber,
  Min,
  IsInt,
} from 'class-validator';

// ===== Enums =====

export enum CardType {
  RECOGNITION = 'recognition',
  PRODUCTION = 'production',
  CLOZE = 'cloze',
  GRAMMAR = 'grammar',
}

export enum CardState {
  NEW = 'new',
  LEARNING = 'learning',
  REVIEW = 'review',
  RELEARNING = 'relearning',
}

export enum ReviewRating {
  AGAIN = 'again',
  HARD = 'hard',
  GOOD = 'good',
  EASY = 'easy',
}

export enum NoteSourceType {
  MANUAL = 'manual',
  HIGHLIGHT = 'highlight',
  AI_GENERATED = 'ai_generated',
  DICTIONARY = 'dictionary',
}

export enum CardSourceType {
  SENTENCE = 'sentence', // highlight, manual - sentence-based learning
  DICTIONARY = 'dictionary', // vocabulary learning from dictionary entries
}

// ===== DTOs =====

export class CreateLearningNoteDto {
  @ApiProperty({ description: 'Sentence in target language (L2)' })
  @IsString()
  @IsNotEmpty()
  targetSentence!: string;

  @ApiProperty({ description: 'Translation/meaning in native language (L1)' })
  @IsString()
  @IsNotEmpty()
  meaning!: string;

  @ApiProperty({ description: 'Target word or grammar focus' })
  @IsString()
  @IsNotEmpty()
  targetWord!: string;

  @ApiPropertyOptional({ description: 'Additional notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Alternative phrasing' })
  @IsOptional()
  @IsString()
  alternativePhrasing?: string;

  @ApiPropertyOptional({ description: 'Source book ID' })
  @IsOptional()
  @IsString()
  bookId?: string;

  @ApiPropertyOptional({ description: 'Source highlight ID' })
  @IsOptional()
  @IsString()
  highlightId?: string;

  @ApiPropertyOptional({ description: 'Source dictionary entry ID' })
  @IsOptional()
  @IsString()
  dictionaryEntryId?: string;

  @ApiPropertyOptional({
    description: 'Source type for card generation (dictionary uses word-focused templates)',
    enum: ['sentence', 'dictionary'],
  })
  @IsOptional()
  @IsString()
  sourceType?: 'sentence' | 'dictionary';
}

export class UpdateLearningNoteDto {
  @ApiPropertyOptional({ description: 'Sentence in target language (L2)' })
  @IsOptional()
  @IsString()
  targetSentence?: string;

  @ApiPropertyOptional({ description: 'Translation/meaning' })
  @IsOptional()
  @IsString()
  meaning?: string;

  @ApiPropertyOptional({ description: 'Target word or grammar focus' })
  @IsOptional()
  @IsString()
  targetWord?: string;

  @ApiPropertyOptional({ description: 'Additional notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Alternative phrasing' })
  @IsOptional()
  @IsString()
  alternativePhrasing?: string;

  @ApiPropertyOptional({ description: 'Archive the note' })
  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;
}

export class ValidateNoteDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  targetSentence!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  meaning!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  targetWord!: string;
}

export class SubmitReviewDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  cardId!: string;

  @ApiProperty({ enum: ReviewRating })
  @IsEnum(ReviewRating)
  rating!: ReviewRating;

  @ApiProperty({ description: 'Response time in milliseconds' })
  @IsNumber()
  @Min(0)
  responseTimeMs!: number;

  @ApiPropertyOptional({ description: 'User marked as hesitant' })
  @IsOptional()
  @IsBoolean()
  wasHesitant?: boolean;
}

export class StartSessionDto {
  // Empty for now, can add options later
}

export class EndSessionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  sessionId!: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  totalTimeMs!: number;
}

export class UpdateSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  generateRecognition?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  generateProduction?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  generateCloze?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  generateGrammar?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  newCardsPerDay?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  maxReviewsPerDay?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showResponseTime?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enforceProduction?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requireTyping?: boolean;
}

// ===== Response Types =====

export class ValidationResultResponse {
  @ApiProperty()
  isValid!: boolean;

  @ApiProperty({ type: [String] })
  warnings!: string[];

  @ApiProperty({ type: [String] })
  errors!: string[];
}

export class LearningCardResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  noteId!: string;

  @ApiProperty({ enum: CardType })
  cardType!: CardType;

  @ApiProperty()
  front!: string;

  @ApiProperty()
  back!: string;

  @ApiPropertyOptional()
  clozeIndex?: number | null;

  @ApiProperty({ enum: CardState })
  state!: CardState;

  @ApiProperty({ type: 'string', format: 'date-time' })
  dueAt!: Date;

  @ApiProperty()
  difficulty!: number;

  @ApiProperty()
  lapseCount!: number;
}

export class LearningNoteResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  userId!: string;

  @ApiPropertyOptional()
  bookId?: string | null;

  @ApiPropertyOptional()
  highlightId?: string | null;

  @ApiProperty()
  targetSentence!: string;

  @ApiProperty()
  meaning!: string;

  @ApiProperty()
  targetWord!: string;

  @ApiPropertyOptional()
  notes?: string | null;

  @ApiPropertyOptional()
  alternativePhrasing?: string | null;

  @ApiProperty({ enum: NoteSourceType })
  sourceType!: NoteSourceType;

  @ApiProperty()
  isArchived!: boolean;

  @ApiProperty({ type: 'string', format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: 'string', format: 'date-time' })
  updatedAt!: Date;

  @ApiProperty({ type: [LearningCardResponse] })
  cards!: LearningCardResponse[];
}

export class StudyQueueResponse {
  @ApiProperty({ type: [LearningCardResponse] })
  newCards!: LearningCardResponse[];

  @ApiProperty({ type: [LearningCardResponse] })
  reviewCards!: LearningCardResponse[];

  @ApiProperty({ type: [LearningCardResponse] })
  learningCards!: LearningCardResponse[];

  @ApiProperty()
  totalDue!: number;

  @ApiProperty()
  newAvailable!: number;

  @ApiProperty()
  reviewsAvailable!: number;
}

export class SessionStartResponse {
  @ApiProperty()
  sessionId!: string;

  @ApiProperty({ type: 'string', format: 'date-time' })
  startedAt!: Date;
}

export class ReviewResultResponse {
  @ApiProperty()
  cardId!: string;

  @ApiProperty()
  newDifficulty!: number;

  @ApiProperty()
  newStability!: number;

  @ApiProperty({ enum: CardState })
  newState!: CardState;

  @ApiProperty()
  intervalDays!: number;

  @ApiProperty({ type: 'string', format: 'date-time' })
  nextDueAt!: Date;
}

export class StatsResponse {
  @ApiProperty()
  retentionRate!: number;

  @ApiProperty()
  matureVocabulary!: number;

  @ApiProperty()
  youngVocabulary!: number;

  @ApiProperty()
  newCards!: number;

  @ApiProperty()
  productionAccuracy!: number;

  @ApiProperty()
  estimatedUsableVocabulary!: number;

  @ApiProperty()
  dailyCognitiveLoad!: number;

  @ApiProperty()
  currentStreak!: number;

  @ApiProperty({ type: [Number], description: 'Reviews due for next 7 days' })
  reviewsForecast!: number[];

  @ApiPropertyOptional({ description: 'Warning if recognition/production imbalance detected' })
  imbalanceWarning?: string;
}

export class DailyStatsResponse {
  @ApiProperty({ type: 'string', format: 'date' })
  date!: string;

  @ApiProperty()
  newCardsStudied!: number;

  @ApiProperty()
  reviewsCompleted!: number;

  @ApiProperty()
  correctCount!: number;

  @ApiProperty()
  incorrectCount!: number;

  @ApiProperty()
  timeSpentMs!: number;
}

export class SettingsResponse {
  @ApiProperty()
  generateRecognition!: boolean;

  @ApiProperty()
  generateProduction!: boolean;

  @ApiProperty()
  generateCloze!: boolean;

  @ApiProperty()
  generateGrammar!: boolean;

  @ApiProperty()
  newCardsPerDay!: number;

  @ApiProperty()
  maxReviewsPerDay!: number;

  @ApiProperty()
  showResponseTime!: boolean;

  @ApiProperty()
  enforceProduction!: boolean;

  @ApiProperty()
  requireTyping!: boolean;
}
