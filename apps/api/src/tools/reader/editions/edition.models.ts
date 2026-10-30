import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { EditionFigures, EditionLength } from '@prisma/client';
import { JobResponse } from '@platform/jobs/job.models';

/** User-facing state of an edition, derived from its row and its job. */
export const EDITION_STATES = ['queued', 'running', 'waiting', 'ready', 'failed', 'cancelled'] as const;
export type EditionState = (typeof EDITION_STATES)[number];

export class CreateEditionDto {
  @ApiPropertyOptional({
    enum: EditionLength,
    default: EditionLength.standard,
    description: 'short ≈ 12–38%, standard ≈ 15–50%, long ≈ 20–55% of each part, by its density',
  })
  @IsOptional()
  @IsEnum(EditionLength)
  length?: EditionLength;

  @ApiPropertyOptional({
    enum: EditionFigures,
    default: EditionFigures.key,
    description: 'key: captioned, referenced or large pictures; all: every picture that is not decoration',
  })
  @IsOptional()
  @IsEnum(EditionFigures)
  figures?: EditionFigures;
}

export class CreateEditionResponse {
  @ApiProperty() editionId!: string;
  @ApiProperty({ description: 'the reader.abridge job; follow GET /jobs/:id or its stream' }) jobId!: string;
  @ApiProperty({ description: 'true when an equal edition already existed or was already being made' })
  existing!: boolean;
  @ApiPropertyOptional({ nullable: true, description: 'the edition in the library, once it is made' })
  editionBookId?: string | null;
}

export class EditionResponse {
  @ApiProperty() id!: string;
  @ApiProperty() bookId!: string;
  @ApiProperty({ enum: EditionLength }) length!: EditionLength;
  @ApiProperty({ enum: EditionFigures }) figures!: EditionFigures;
  @ApiProperty({ enum: EDITION_STATES }) state!: EditionState;
  @ApiPropertyOptional({ nullable: true }) jobId?: string | null;
  @ApiPropertyOptional({ type: JobResponse, nullable: true }) job?: JobResponse | null;
  @ApiPropertyOptional({ nullable: true, description: 'the edition as a book of the library' })
  editionBookId?: string | null;
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    description: 'what the job reported: ratio, chapters, pictures, fact-check counts, warnings, timings',
  })
  result?: Record<string, unknown> | null;
  @ApiProperty({ type: 'string', format: 'date-time' }) createdAt!: Date;
}

export class DocumentStructureResponse {
  @ApiProperty() bookId!: string;
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'contents with kinds and sizes, language, pictures, as read by reader.ingest',
  })
  structure!: Record<string, unknown>;
}

/** Where a chapter of an edition being made has got to (the worker's manifest). */
export const CHAPTER_STATES = ['pending', 'written', 'checked', 'fixed'] as const;
export type ChapterState = (typeof CHAPTER_STATES)[number];

export class EditionChapterProgress {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ description: '1 or 2, as in the edition\'s contents' }) level!: number;
  @ApiProperty({ description: 'a part title without text of its own' }) divider!: boolean;
  @ApiProperty() words!: number;
  @ApiProperty({ enum: CHAPTER_STATES }) state!: ChapterState;
}

export class EditionProgressResponse {
  @ApiProperty() editionId!: string;
  @ApiProperty({ enum: EDITION_STATES }) state!: EditionState;
  @ApiPropertyOptional({ type: JobResponse, nullable: true }) job?: JobResponse | null;
  @ApiProperty({ type: [EditionChapterProgress], description: 'empty until the worker has planned the chapters' })
  chapters!: EditionChapterProgress[];
  @ApiProperty({ description: 'words of the chapters to abridge' }) totalWords!: number;
  @ApiProperty({ description: 'words of the chapters already written' }) writtenWords!: number;
  @ApiProperty({ description: 'the book overview is written' }) overview!: boolean;
  @ApiPropertyOptional({ nullable: true, description: 'all, dense or off; null until the worker has planned' })
  factcheck?: string | null;
}
