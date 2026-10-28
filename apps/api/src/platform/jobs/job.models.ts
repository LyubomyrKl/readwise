import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Job, JobStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class JobResponse {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'reader.summarize' }) type!: string;
  @ApiProperty({ example: 'reader' }) toolId!: string;
  @ApiProperty() userId!: string;
  @ApiPropertyOptional({ nullable: true, example: 'book' }) subjectType?: string | null;
  @ApiPropertyOptional({ nullable: true }) subjectId?: string | null;
  @ApiProperty({ enum: JobStatus }) status!: JobStatus;
  @ApiPropertyOptional({ nullable: true, example: 'section 3/12' }) stage?: string | null;
  @ApiProperty({ minimum: 0, maximum: 100 }) progress!: number;
  @ApiPropertyOptional({ nullable: true, description: 'why the job is waiting (status = waiting)' })
  waitReason?: string | null;
  @ApiPropertyOptional({ nullable: true }) error?: string | null;
  @ApiProperty() attempts!: number;
  @ApiProperty() maxAttempts!: number;
  @ApiPropertyOptional({ nullable: true }) workerId?: string | null;
  @ApiPropertyOptional({ nullable: true, type: 'string', format: 'date-time' }) heartbeatAt?: Date | null;
  @ApiPropertyOptional({ nullable: true }) parentJobId?: string | null;
  @ApiPropertyOptional({ nullable: true }) correlationId?: string | null;
  @ApiPropertyOptional({ nullable: true, type: 'object', additionalProperties: true })
  result?: Record<string, unknown> | null;
  @ApiPropertyOptional({
    description: 'stage and status changes in order: [{ at, status, stage }]',
    type: 'array',
    items: { type: 'object', additionalProperties: true },
  })
  timeline?: Array<{ at: string; status: JobStatus; stage: string | null }>;
  @ApiProperty({ type: 'string', format: 'date-time' }) createdAt!: Date;
  @ApiPropertyOptional({ nullable: true, type: 'string', format: 'date-time' }) startedAt?: Date | null;
  @ApiPropertyOptional({ nullable: true, type: 'string', format: 'date-time' }) finishedAt?: Date | null;
}

export function toJobResponse(job: Job): JobResponse {
  return {
    id: job.id,
    type: job.type,
    toolId: job.toolId,
    userId: job.userId,
    subjectType: job.subjectType,
    subjectId: job.subjectId,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    waitReason: job.waitReason,
    error: job.error,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    workerId: job.workerId,
    heartbeatAt: job.heartbeatAt,
    parentJobId: job.parentJobId,
    correlationId: job.correlationId,
    result: (job.result as Record<string, unknown> | null) ?? null,
    timeline: (Array.isArray(job.timeline) ? job.timeline : []) as Array<{ at: string; status: JobStatus; stage: string | null }>,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
  };
}

export class ListJobsQuery {
  @ApiPropertyOptional({ example: 'book' })
  @IsOptional()
  @IsString()
  subjectType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subjectId?: string;

  @ApiPropertyOptional({ enum: JobStatus })
  @IsOptional()
  @IsEnum(JobStatus)
  status?: JobStatus;

  @ApiPropertyOptional({ example: 'reader.summarize' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
