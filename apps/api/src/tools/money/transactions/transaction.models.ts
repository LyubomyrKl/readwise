import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { AmountJson } from '../common/amounts';
import { DATE_PATTERN } from '../common/validation';

export const TRANSACTION_KINDS = [
  'opening_balance',
  'income',
  'expense',
  'transfer',
  'buy',
  'sell',
  'investment_income',
  'fee',
  'unit_move',
  'split',
  'correction',
] as const;

export class EntryResponse {
  @ApiProperty() id!: string;
  @ApiProperty() accountId!: string;
  @ApiProperty() accountName!: string;
  @ApiProperty({ enum: ['bank', 'investment', 'bonds', 'debt', 'system'] }) accountType!: string;
  @ApiProperty({ nullable: true, enum: ['income', 'expense', 'opening_balance', 'conversion'] }) systemRole!: string | null;
  @ApiProperty({ example: 'PLN' }) commodityId!: string;
  @ApiProperty({ example: 'PLN', description: 'currency code or asset ticker' }) code!: string;
  @ApiProperty({ type: AmountJson, nullable: true }) amount!: AmountJson | null;
  @ApiProperty({ nullable: true, example: '10' }) units!: string | null;
  @ApiProperty({ nullable: true }) categoryId!: string | null;
  @ApiProperty({ nullable: true }) categoryName!: string | null;
}

export class TransactionRef {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}

export class TransactionResponse {
  @ApiProperty() id!: string;
  @ApiProperty({ example: '2026-10-28' }) date!: string;
  @ApiProperty({ enum: TRANSACTION_KINDS }) kind!: string;
  @ApiProperty({ enum: ['posted', 'draft'] }) status!: string;
  @ApiProperty({ nullable: true }) note!: string | null;
  @ApiProperty({ type: TransactionRef, nullable: true }) category!: TransactionRef | null;
  @ApiProperty({ type: TransactionRef, nullable: true, description: 'asset of an investment movement' }) asset!: TransactionRef | null;
  @ApiProperty({ nullable: true, description: 'the transaction this one corrects or reverses' }) correctsId!: string | null;
  @ApiProperty({ nullable: true, description: 'the correction that reversed this one' }) reversedBy!: string | null;
  @ApiProperty({ nullable: true, description: 'the transaction that replaced this one (an edit)' }) replacedBy!: string | null;
  @ApiProperty({ nullable: true, example: 'user' }) proposedBy!: string | null;
  @ApiProperty({ nullable: true, description: 'units of the received currency per unit sent (cross-currency transfers)' })
  impliedRate!: string | null;
  @ApiProperty({ nullable: true, description: '{ kind, input }: what a draft proposes; on a posted draft, what was approved' }) draft!: unknown;
  @ApiProperty({ type: [EntryResponse] }) entries!: EntryResponse[];
  @ApiProperty() createdAt!: string;
  @ApiProperty({ nullable: true }) postedAt!: string | null;
}

export class TransactionPage {
  @ApiProperty({ type: [TransactionResponse] }) items!: TransactionResponse[];
  @ApiProperty({ nullable: true, description: 'pass as `before` for the next page' }) nextCursor!: string | null;
}

export class ListTransactionsQuery {
  @ApiProperty({ required: false, example: '2026-10-01' })
  @IsOptional()
  @Matches(DATE_PATTERN)
  from?: string;

  @ApiProperty({ required: false, example: '2026-10-31' })
  @IsOptional()
  @Matches(DATE_PATTERN)
  to?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  accountId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  assetId?: string;

  @ApiProperty({ required: false, enum: TRANSACTION_KINDS })
  @IsOptional()
  @IsIn(TRANSACTION_KINDS)
  kind?: string;

  @ApiProperty({ required: false, description: 'text in the note' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiProperty({ required: false, example: '50', description: '1..500, default 50' })
  @IsOptional()
  @Matches(/^\d{1,3}$/)
  limit?: string;

  @ApiProperty({ required: false, description: 'nextCursor of the previous page' })
  @IsOptional()
  @IsString()
  before?: string;
}
