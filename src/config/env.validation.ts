import { plainToInstance, Transform } from 'class-transformer';
import { IsString, IsNotEmpty, validateSync, IsOptional } from 'class-validator';

export class EnvironmentVariables {
  @IsNotEmpty()
  @IsString()
  JWT_ACCESS_SECRET!: string;

  @IsNotEmpty()
  @IsString()
  JWT_REFRESH_SECRET!: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: string }) => (value) || '15m')
  JWT_ACCESS_TTL = '15m';

  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: string }) => (value) || '7d')
  JWT_REFRESH_TTL = '7d';

  @IsNotEmpty()
  @IsString()
  DATABASE_URL!: string;
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