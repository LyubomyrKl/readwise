import { plainToInstance, Transform } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  validateSync,
  IsOptional,
} from 'class-validator';

export class EnvironmentVariables {
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

  // Postgres
  @IsNotEmpty()
  @IsString()
  POSTGRES_HOST!: string;

  @IsNotEmpty()
  @IsString()
  POSTGRES_USER!: string;

  @IsNotEmpty()
  @IsString()
  POSTGRES_PASSWORD!: string;

  @IsNotEmpty()
  @IsString()
  POSTGRES_DB!: string;

  // S3/MinIO
  @IsNotEmpty()
  @IsString()
  S3_HOST!: string;

  @IsNotEmpty()
  @IsString()
  S3_PUBLIC_HOST!: string;

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
  S3_REGION = 'us-east-1';

  // RabbitMQ
  @IsNotEmpty()
  @IsString()
  RABBITMQ_HOST!: string;

  @IsNotEmpty()
  @IsString()
  RABBITMQ_USER!: string;

  @IsNotEmpty()
  @IsString()
  RABBITMQ_PASS!: string;
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
