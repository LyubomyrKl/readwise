import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, Matches } from 'class-validator';
import { CURRENCY_PATTERN } from '../common/validation';

export class MoneySettingsResponse {
  @ApiProperty({ example: 'PLN' }) baseCurrency!: string;
  @ApiProperty({ enum: ['fifo', 'average'] }) defaultCostBasis!: string;
  @ApiProperty({ example: 'PL' }) taxResidence!: string;
  @ApiProperty({ example: '5', description: 'what investments are expected to earn a year, in percent; the forecast grows what is invested at it' })
  expectedReturn!: string;
  @ApiProperty({ nullable: true, example: '2026-06', description: 'the first month the forecasts learn from; null: the last twelve months' })
  forecastSince!: string | null;
}

export class UpdateMoneySettingsDto {
  @ApiProperty({ required: false, example: 'EUR', description: 'any supported currency' })
  @IsOptional()
  @Matches(CURRENCY_PATTERN)
  baseCurrency?: string;

  @ApiProperty({ required: false, enum: ['fifo', 'average'] })
  @IsOptional()
  @IsIn(['fifo', 'average'])
  defaultCostBasis?: 'fifo' | 'average';

  @ApiProperty({ required: false, example: 'PL', description: 'ISO 3166-1 alpha-2' })
  @IsOptional()
  @Matches(/^[A-Z]{2}$/)
  taxResidence?: string;

  @ApiProperty({ required: false, example: '5', description: 'percent a year, 0 to 99.99' })
  @IsOptional()
  @Matches(/^\d{1,2}(\.\d{1,2})?$/, { message: 'expectedReturn must be a percent from 0 to 99.99' })
  expectedReturn?: string;

  @ApiProperty({ required: false, nullable: true, example: '2026-06', description: 'YYYY-MM, when things changed (a tax began); null: the last twelve months' })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'forecastSince must be a month, YYYY-MM' })
  forecastSince?: string | null;
}
