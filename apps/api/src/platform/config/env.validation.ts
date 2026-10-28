import { plainToInstance, Transform } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  validateSync,
  IsOptional,
  IsIn,
  IsInt,
  Min,
} from 'class-validator';

export type AppMode = 'api' | 'worker' | 'all';

const intWithDefault = (fallback: number) =>
  Transform(({ value }: { value: unknown }) =>
    value === '' || value === undefined || value === null ? fallback : Number(value),
  );

export class EnvironmentVariables {
  // ---- process role (same image, see docs/toolbox-architecture-plan.md 2.9)
  // api: HTTP only; worker: queue consumers and the job sweep only; all: both.
  @IsOptional()
  @IsIn(['api', 'worker', 'all'])
  @Transform(({ value }: { value: string }) => value || 'all')
  APP_MODE: AppMode = 'all';

  // ---- auth
  @IsNotEmpty()
  @IsString()
  JWT_ACCESS_SECRET!: string;

  @IsNotEmpty()
  @IsString()
  JWT_REFRESH_SECRET!: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: string }) => value || '15m')
  JWT_ACCESS_TTL = '15m';

  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: string }) => value || '7d')
  JWT_REFRESH_TTL = '7d';

  // ---- Postgres (the same URL the Prisma CLI uses for migrations)
  @IsNotEmpty()
  @IsString()
  DATABASE_URL!: string;

  // ---- S3/MinIO
  @IsNotEmpty()
  @IsString()
  S3_HOST!: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: string }) => value || '9000')
  S3_PORT = '9000';

  /** Full endpoint URL; overrides S3_HOST/S3_PORT when set. */
  @IsOptional()
  @IsString()
  S3_ENDPOINT?: string;

  @IsNotEmpty()
  @IsString()
  S3_ACCESS_KEY_ID!: string;

  @IsNotEmpty()
  @IsString()
  S3_SECRET_ACCESS_KEY!: string;

  @IsNotEmpty()
  @IsString()
  S3_BOOK_BUCKET_NAME!: string;

  @IsNotEmpty()
  @IsString()
  S3_BOOK_COVER_BUCKET_NAME!: string;

  @IsNotEmpty()
  @IsString()
  S3_SUMMARIES_BUCKET_NAME!: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: string }) => value || 'extractions')
  S3_EXTRACTIONS_BUCKET_NAME = 'extractions';

  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: string }) => value || 'checkpoints')
  S3_CHECKPOINTS_BUCKET_NAME = 'checkpoints';

  @IsOptional()
  @IsString()
  S3_REGION = 'us-east-1';

  // ---- RabbitMQ
  @IsNotEmpty()
  @IsString()
  RABBITMQ_HOST!: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: string }) => value || '5672')
  RABBITMQ_PORT = '5672';

  @IsNotEmpty()
  @IsString()
  RABBITMQ_USER!: string;

  @IsNotEmpty()
  @IsString()
  RABBITMQ_PASS!: string;

  // ---- LLM host for Node tools (platform/ai); the same variables the workers read
  @IsOptional()
  @IsString()
  OLLAMA_BASE_URL?: string;

  @IsOptional()
  @IsString()
  OLLAMA_MODEL?: string;

  @IsOptional()
  @IsString()
  OLLAMA_EMBED_MODEL?: string;

  @IsOptional()
  @IsInt()
  @Min(5)
  @intWithDefault(120)
  AI_TIMEOUT_SECONDS = 120;

  // ---- jobs (platform/jobs)
  /** A running or waiting job whose last heartbeat is older than this is considered lost. */
  @IsOptional()
  @IsInt()
  @Min(60)
  @intWithDefault(900)
  JOBS_LEASE_SECONDS = 900;

  @IsOptional()
  @IsInt()
  @Min(5)
  @intWithDefault(60)
  JOBS_SWEEP_INTERVAL_SECONDS = 60;

  @IsOptional()
  @IsInt()
  @Min(1)
  @intWithDefault(3)
  JOBS_MAX_ATTEMPTS = 3;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }
  return validatedConfig;
}
