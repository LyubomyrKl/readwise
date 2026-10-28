import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsObject, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { DATE_MESSAGE, DATE_PATTERN } from '../common/validation';
import type { MovementKind } from '../movements/movement.models';

/** What a recurring rule may repeat. */
export const RECURRING_KINDS = ['income', 'expense', 'fee', 'transfer', 'buy', 'sell', 'investment_income'] as const satisfies readonly MovementKind[];
export type RecurringKind = (typeof RECURRING_KINDS)[number];

export class CreateRecurringDto {
  @ApiProperty({ example: 'Rent' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @ApiProperty({ enum: RECURRING_KINDS })
  @IsIn(RECURRING_KINDS)
  kind!: RecurringKind;

  @ApiProperty({ description: 'the movement as its endpoint takes it, without the date', example: { accountId: '…', currency: 'PLN', amount: '3500.00' } })
  @IsObject()
  template!: Record<string, unknown>;

  @ApiProperty({ example: 'FREQ=MONTHLY;BYMONTHDAY=10', description: 'FREQ=DAILY|WEEKLY|MONTHLY|YEARLY with INTERVAL, BYDAY, BYMONTHDAY, BYMONTH' })
  @IsString()
  @MaxLength(200)
  schedule!: string;

  @ApiProperty({ example: '2026-11-10' })
  @Matches(DATE_PATTERN, { message: `startDate must be ${DATE_MESSAGE}` })
  startDate!: string;

  @ApiProperty({ required: false, nullable: true, example: '2027-10-10' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(DATE_PATTERN, { message: `endDate must be ${DATE_MESSAGE}` })
  endDate?: string | null;

  @ApiProperty({ required: false, description: 'post on the day instead of proposing a draft (default false)' })
  @IsOptional()
  @IsBoolean()
  autoPost?: boolean;
}

export class UpdateRecurringDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  template?: Record<string, unknown>;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  schedule?: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(DATE_PATTERN, { message: `endDate must be ${DATE_MESSAGE}` })
  endDate?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  autoPost?: boolean;

  @ApiProperty({ required: false, description: 'true pauses, false resumes from the next date after today' })
  @IsOptional()
  @IsBoolean()
  paused?: boolean;
}

export class RecurringResponse {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: RECURRING_KINDS }) kind!: string;
  @ApiProperty() template!: Record<string, unknown>;
  @ApiProperty({ example: 'FREQ=MONTHLY;BYMONTHDAY=10' }) schedule!: string;
  @ApiProperty() startDate!: string;
  @ApiProperty({ nullable: true }) endDate!: string | null;
  @ApiProperty({ description: 'the next day it runs' }) nextRunAt!: string;
  @ApiProperty({ type: [String], description: 'the next few days it runs' }) upcoming!: string[];
  @ApiProperty() autoPost!: boolean;
  @ApiProperty() paused!: boolean;
  @ApiProperty({ description: 'past its end date' }) finished!: boolean;
  @ApiProperty({ nullable: true }) lastRunAt!: string | null;
  @ApiProperty({ description: 'movements and drafts it made' }) runs!: number;
  @ApiProperty() createdAt!: string;
}

export class RecurringRunResult {
  @ApiProperty() posted!: number;
  @ApiProperty() drafted!: number;
  @ApiProperty({ description: 'rules that could not run, with why' }) errors!: { ruleId: string; name: string; date: string; error: string }[];
}
