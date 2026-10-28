import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, Matches } from 'class-validator';
import { CURRENCY_PATTERN } from '../common/validation';

export class MoneySettingsResponse {
  @ApiProperty({ example: 'PLN' }) baseCurrency!: string;
  @ApiProperty({ enum: ['fifo', 'average'] }) defaultCostBasis!: string;
  @ApiProperty({ example: 'PL' }) taxResidence!: string;
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
}
