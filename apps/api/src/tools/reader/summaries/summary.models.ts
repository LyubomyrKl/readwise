import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { SummaryType, SummarizationStrategy } from '@prisma/client';
import { JobResponse } from '@platform/jobs/job.models';

/** User-facing state of a summary, derived from its row and its job. */
export const SUMMARY_STATES = ['queued', 'running', 'waiting', 'ready', 'failed', 'cancelled'] as const;
export type SummaryState = (typeof SUMMARY_STATES)[number];

export class CreateSummaryDto {
  @ApiPropertyOptional({ enum: SummaryType, default: SummaryType.abstractive })
  @IsOptional()
  @IsEnum(SummaryType)
  summaryType?: SummaryType;

  @ApiPropertyOptional({ enum: SummarizationStrategy, default: SummarizationStrategy.structured })
  @IsOptional()
  @IsEnum(SummarizationStrategy)
  summarizationStrategy?: SummarizationStrategy;
}

export class CreateSummaryResponse {
  @ApiProperty() summaryId!: string;
  @ApiProperty({ description: 'the reader.summarize job; poll GET /jobs/:id' }) jobId!: string;
  @ApiPropertyOptional({ nullable: true, description: 'the reader.extract job when the text had to be extracted first' })
  extractJobId?: string | null;
  @ApiProperty({ description: 'true when an equal summary already existed or was already in progress' })
  existing!: boolean;
  @ApiPropertyOptional({ nullable: true, description: 'storage key when the summary already exists' })
  storageKey?: string | null;
}

export class SummaryResponse {
  @ApiProperty() id!: string;
  @ApiProperty() bookId!: string;
  @ApiProperty({ enum: SummaryType }) type!: SummaryType;
  @ApiProperty({ enum: SummarizationStrategy }) strategy!: SummarizationStrategy;
  @ApiProperty() percent!: number;
  @ApiPropertyOptional({ nullable: true }) storageKey?: string | null;
  @ApiPropertyOptional({ nullable: true }) jobId?: string | null;
  @ApiProperty({ enum: SUMMARY_STATES }) state!: SummaryState;
  @ApiPropertyOptional({ type: JobResponse, nullable: true }) job?: JobResponse | null;
  @ApiProperty({ type: 'string', format: 'date-time' }) createdAt!: Date;
}

export class SummaryContentResponse extends SummaryResponse {
  @ApiProperty({ type: 'object', additionalProperties: true, description: 'the summary JSON written by the worker' })
  summary!: Record<string, unknown>;
}

// ---- compatibility shapes used by the current web client; removed in Phase 5 ----

export class RequestSummaryDto {
  @ApiProperty({ description: 'ID of the book to summarize' })
  @IsString()
  @IsNotEmpty()
  bookId: string;

  @ApiPropertyOptional({ enum: SummaryType, default: SummaryType.extractive })
  @IsOptional()
  @IsEnum(SummaryType)
  summaryType?: SummaryType;

  @ApiPropertyOptional({ enum: SummarizationStrategy, default: SummarizationStrategy.structured })
  @IsOptional()
  @IsEnum(SummarizationStrategy)
  summarizationStrategy?: SummarizationStrategy;
}

export class GetSummaryDto {
  @ApiProperty({ description: 'ID of the book to get the summary for' })
  @IsString()
  @IsNotEmpty()
  bookId: string;
}

export class SummaryRequestResponse {
  @ApiProperty({ example: true }) success: boolean;
  @ApiProperty({ example: 'Summary request queued successfully' }) message: string;
  @ApiProperty() userId: string;
  @ApiProperty() bookId: string;
  @ApiPropertyOptional({ description: 'storage key of the existing summary, if one exists' }) summaryKey?: string;
  @ApiPropertyOptional() summaryId?: string;
  @ApiPropertyOptional() jobId?: string;
}

export class LegacySummaryResponse {
  @ApiProperty() bookId: string;
  @ApiProperty() summaryId: string;
  @ApiProperty({ enum: SummaryType }) summaryType: SummaryType;
  @ApiProperty({ enum: SummarizationStrategy }) summarizationStrategy: SummarizationStrategy;
  @ApiProperty() summaryKey: string;
  @ApiProperty({ type: 'string', format: 'date-time' }) createdAt: Date;
  @ApiProperty({ type: 'object', additionalProperties: true }) summary: Record<string, unknown>;
}

export class SummaryStatusResponse {
  @ApiProperty({ enum: ['processing', 'ready', 'error'], description: 'processing while a job is active' })
  status: string;
  @ApiProperty() bookId: string;
  @ApiProperty() isReady: boolean;
  @ApiPropertyOptional() summaryKey?: string;
  @ApiPropertyOptional({ enum: SummaryType }) summaryType?: SummaryType;
  @ApiPropertyOptional({ enum: SummarizationStrategy }) summarizationStrategy?: SummarizationStrategy;
  @ApiPropertyOptional({ nullable: true }) errorMessage?: string | null;
  @ApiPropertyOptional() summaryId?: string;
  @ApiPropertyOptional() jobId?: string;
  @ApiPropertyOptional({ description: 'queued | running | waiting | succeeded | failed | cancelled' }) jobStatus?: string;
  @ApiPropertyOptional({ nullable: true }) stage?: string | null;
  @ApiPropertyOptional() progress?: number;
  @ApiPropertyOptional({ nullable: true }) waitReason?: string | null;
}
