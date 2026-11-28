import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, Matches } from 'class-validator';
import { CURRENCY_PATTERN } from '../common/validation';

/** The months the forecasts learn from: rolling ranges before this month, or a custom one. */
export const FORECAST_RANGES = ['last_month', 'last_3_months', 'last_6_months', 'last_12_months', 'this_year', 'custom'] as const;
export type ForecastRange = (typeof FORECAST_RANGES)[number];
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export class MoneySettingsResponse {
  @ApiProperty({ example: 'PLN' }) baseCurrency!: string;
  @ApiProperty({ enum: ['fifo', 'average'] }) defaultCostBasis!: string;
  @ApiProperty({ example: 'PL' }) taxResidence!: string;
  @ApiProperty({ example: '5', description: 'what investments are expected to earn a year, in percent; the forecast grows what is invested at it' })
  expectedReturn!: string;
  @ApiProperty({ enum: FORECAST_RANGES, description: 'the months the forecasts learn from; custom: forecastSince to forecastUntil' })
  forecastRange!: ForecastRange;
  @ApiProperty({ nullable: true, example: '2026-06', description: "a custom range's first month" }) forecastSince!: string | null;
  @ApiProperty({ nullable: true, example: null, description: "a custom range's last month; null: up to last month" }) forecastUntil!: string | null;
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

  @ApiProperty({ required: false, enum: FORECAST_RANGES })
  @IsOptional()
  @IsIn(FORECAST_RANGES)
  forecastRange?: ForecastRange;

  @ApiProperty({ required: false, nullable: true, example: '2026-06', description: "a custom range's first month, YYYY-MM (things changed then: a tax began)" })
  @IsOptional()
  @Matches(MONTH, { message: 'forecastSince must be a month, YYYY-MM' })
  forecastSince?: string | null;

  @ApiProperty({ required: false, nullable: true, example: '2026-09', description: "a custom range's last month, YYYY-MM; null: up to last month" })
  @IsOptional()
  @Matches(MONTH, { message: 'forecastUntil must be a month, YYYY-MM' })
  forecastUntil?: string | null;
}
