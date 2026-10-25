import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';
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

export class ListSummariesQuery {
  @ApiPropertyOptional({ description: 'Only the newest summary of each document', default: false })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === true || value === 'true' || value === '1'
      ? true
      : value === false || value === 'false' || value === '0'
        ? false
        : value,
  )
  @IsBoolean()
  latestPerBook?: boolean;

  @ApiPropertyOptional({ default: 100, minimum: 1, maximum: 500 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
