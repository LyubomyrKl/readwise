import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import {
  AMOUNT_MESSAGE,
  AMOUNT_PATTERN,
  CURRENCY_PATTERN,
  DATE_MESSAGE,
  DATE_PATTERN,
  SIGNED_AMOUNT_PATTERN,
} from '../common/validation';

/** Every kind of movement the ledger posts; drafts, imports, recurring rules and Claude use the same names. */
export const MOVEMENT_KINDS = [
  'income',
  'expense',
  'transfer',
  'opening_balance',
  'fee',
  'buy',
  'sell',
  'investment_income',
  'unit_move',
  'split',
] as const;
export type MovementKind = (typeof MOVEMENT_KINDS)[number];

export class MovementBaseDto {
  @ApiProperty({ example: '2026-10-28' })
  @Matches(DATE_PATTERN, { message: `date must be ${DATE_MESSAGE}` })
  date!: string;

  @ApiProperty({ required: false, example: 'Biedronka' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CashMovementDto extends MovementBaseDto {
  @ApiProperty()
  @IsString()
  accountId!: string;

  @ApiProperty({ example: 'PLN' })
  @Matches(CURRENCY_PATTERN, { message: 'currency must be an ISO 4217 code like PLN' })
  currency!: string;

  @ApiProperty({ example: '123.45' })
  @Matches(AMOUNT_PATTERN, { message: `amount must be ${AMOUNT_MESSAGE}` })
  amount!: string;

  @ApiProperty({ required: false, description: 'default: Other income / Other expenses (Fees for a fee)' })
  @IsOptional()
  @IsString()
  categoryId?: string;
}

export class IncomeDto extends CashMovementDto {}
export class ExpenseDto extends CashMovementDto {}
export class FeeDto extends CashMovementDto {}

export class OpeningBalanceDto extends MovementBaseDto {
  @ApiProperty()
  @IsString()
  accountId!: string;

  @ApiProperty({ example: 'PLN' })
  @Matches(CURRENCY_PATTERN)
  currency!: string;

  @ApiProperty({ example: '-1500.00', description: 'negative for money owed' })
  @Matches(SIGNED_AMOUNT_PATTERN, { message: `amount must be ${AMOUNT_MESSAGE}` })
  amount!: string;
}

export class TransferDto extends MovementBaseDto {
  @ApiProperty()
  @IsString()
  fromAccountId!: string;

  @ApiProperty({ example: 'PLN' })
  @Matches(CURRENCY_PATTERN)
  fromCurrency!: string;

  @ApiProperty({ example: '1000.00', description: 'everything that left the sending account, fee included' })
  @Matches(AMOUNT_PATTERN, { message: `amountOut must be ${AMOUNT_MESSAGE}` })
  amountOut!: string;

  @ApiProperty()
  @IsString()
  toAccountId!: string;

  @ApiProperty({ required: false, example: 'EUR', description: 'default: the sending currency' })
  @IsOptional()
  @Matches(CURRENCY_PATTERN)
  toCurrency?: string;

  @ApiProperty({ required: false, example: '230.45', description: 'what arrived; required across currencies' })
  @IsOptional()
  @Matches(AMOUNT_PATTERN, { message: `amountIn must be ${AMOUNT_MESSAGE}` })
  amountIn?: string;

  @ApiProperty({ required: false, example: '2.00', description: 'part of amountOut, in the sending currency' })
  @IsOptional()
  @Matches(AMOUNT_PATTERN, { message: `fee must be ${AMOUNT_MESSAGE}` })
  fee?: string;

  @ApiProperty({ required: false, description: 'default: Fees' })
  @IsOptional()
  @IsString()
  feeCategoryId?: string;
}

/** A movement as data: drafts, import rows, recurring templates and Claude's proposals. */
export class MovementDto {
  @ApiProperty({ enum: MOVEMENT_KINDS })
  @IsIn(MOVEMENT_KINDS)
  kind!: MovementKind;

  @ApiProperty({ description: 'the body the movement endpoint for this kind accepts' })
  @IsObject()
  input!: Record<string, unknown>;
}

export class ReverseDto {
  @ApiProperty({ required: false, example: '2026-10-28', description: 'default: the date of the original' })
  @IsOptional()
  @Matches(DATE_PATTERN, { message: `date must be ${DATE_MESSAGE}` })
  date?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
