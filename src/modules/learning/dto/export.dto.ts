import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsArray, ValidateNested, IsOptional, IsNumber, IsBoolean, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { NoteSourceType, CardType, CardState } from '../learning.models';

export class ExportCardData {
  @ApiProperty({ enum: CardType })
  cardType!: CardType;

  @ApiProperty()
  front!: string;

  @ApiProperty()
  back!: string;

  @ApiProperty({ enum: CardState })
  state!: CardState;

  @ApiProperty()
  difficulty!: number;

  @ApiProperty()
  stability!: number;

  @ApiProperty()
  reviewCount!: number;

  @ApiPropertyOptional()
  clozeIndex?: number | null;
}

export class ExportNoteData {
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
  createdAt!: string;

  @ApiProperty({ type: [ExportCardData] })
  cards!: ExportCardData[];
}

export class ExportStatistics {
  @ApiProperty()
  totalNotes!: number;

  @ApiProperty()
  matureVocabulary!: number;

  @ApiProperty()
  retentionRate!: number;
}

export class ExportSettings {
  @ApiProperty()
  generateRecognition!: boolean;

  @ApiProperty()
  generateProduction!: boolean;

  @ApiProperty()
  generateCloze!: boolean;

  @ApiProperty()
  newCardsPerDay!: number;

  @ApiProperty()
  maxReviewsPerDay!: number;
}

export class LearningExportResponse {
  @ApiProperty()
  version!: string;

  @ApiProperty()
  exportedAt!: string;

  @ApiProperty({ type: ExportStatistics })
  statistics!: ExportStatistics;

  @ApiProperty({ type: [ExportNoteData] })
  notes!: ExportNoteData[];

  @ApiProperty({ type: ExportSettings })
  settings!: ExportSettings;
}

export class ImportCardData {
  @ApiProperty({ enum: CardType })
  @IsString()
  cardType!: CardType;

  @ApiProperty()
  @IsString()
  front!: string;

  @ApiProperty()
  @IsString()
  back!: string;

  @ApiProperty({ enum: CardState })
  @IsString()
  state!: CardState;

  @ApiProperty()
  @IsNumber()
  difficulty!: number;

  @ApiProperty()
  @IsNumber()
  stability!: number;

  @ApiProperty()
  @IsNumber()
  reviewCount!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  clozeIndex?: number | null;
}

export class ImportNoteData {
  @ApiProperty()
  @IsString()
  targetSentence!: string;

  @ApiProperty()
  @IsString()
  meaning!: string;

  @ApiProperty()
  @IsString()
  targetWord!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  alternativePhrasing?: string | null;

  @ApiProperty({ enum: NoteSourceType })
  @IsString()
  sourceType!: NoteSourceType;

  @ApiProperty()
  @IsDateString()
  createdAt!: string;

  @ApiProperty({ type: [ImportCardData] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportCardData)
  cards!: ImportCardData[];
}

export class ImportLearningDataDto {
  @ApiProperty()
  @IsString()
  version!: string;

  @ApiProperty({ type: [ImportNoteData] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportNoteData)
  notes!: ImportNoteData[];

  @ApiPropertyOptional({ description: 'Whether to skip existing notes (based on targetSentence + targetWord)' })
  @IsOptional()
  @IsBoolean()
  skipExisting?: boolean;
}

export class ImportResultResponse {
  @ApiProperty()
  imported!: number;

  @ApiProperty()
  skipped!: number;

  @ApiProperty()
  errors!: number;

  @ApiProperty({ type: [String] })
  errorMessages!: string[];
}

export class CsvExportRow {
  targetSentence!: string;
  meaning!: string;
  targetWord!: string;
  notes!: string;
  sourceType!: string;
  createdAt!: string;
  cardState!: string;
  difficulty!: string;
  reviewCount!: string;
}
