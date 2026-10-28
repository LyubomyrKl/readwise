import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, Matches } from 'class-validator';
import { CURRENCY_PATTERN, DATE_MESSAGE, DATE_PATTERN, RATE_PATTERN } from '../common/validation';

export class RateQuery {
  @ApiProperty({ required: false, example: 'EUR' })
  @IsOptional()
  @Matches(CURRENCY_PATTERN)
  from?: string;

  @ApiProperty({ required: false, example: 'PLN' })
  @IsOptional()
  @Matches(CURRENCY_PATTERN)
  to?: string;

  @ApiProperty({ required: false, enum: ['ecb', 'nbp', 'manual'] })
  @IsOptional()
  @IsIn(['ecb', 'nbp', 'manual'])
  source?: 'ecb' | 'nbp' | 'manual';
}

export class CreateRateDto {
  @ApiProperty({ example: '2026-10-27' })
  @Matches(DATE_PATTERN, { message: `date must be ${DATE_MESSAGE}` })
  date!: string;

  @ApiProperty({ example: 'EUR' })
  @Matches(CURRENCY_PATTERN)
  from!: string;

  @ApiProperty({ example: 'PLN' })
  @Matches(CURRENCY_PATTERN)
  to!: string;

  @ApiProperty({ example: '4.2650', description: 'units of `to` for one unit of `from`' })
  @Matches(RATE_PATTERN, { message: 'rate must be a positive decimal like 4.2650' })
  rate!: string;
}

export class RateResponse {
  @ApiProperty() id!: string;
  @ApiProperty() date!: string;
  @ApiProperty() from!: string;
  @ApiProperty() to!: string;
  @ApiProperty() rate!: string;
  @ApiProperty({ enum: ['ecb', 'nbp', 'manual'] }) source!: string;
}

export class RateSourceStatus {
  @ApiProperty({ enum: ['ecb', 'nbp', 'manual'] }) source!: string;
  @ApiProperty({ nullable: true }) first!: string | null;
  @ApiProperty({ nullable: true }) latest!: string | null;
  @ApiProperty() count!: number;
}
