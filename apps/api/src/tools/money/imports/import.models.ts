import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { AmountJson } from '../common/amounts';
import { CURRENCY_PATTERN, DATE_PATTERN, SIGNED_AMOUNT_PATTERN } from '../common/validation';
import { DATE_FORMATS } from '../core/import-parse';

export class UploadImportDto {
  @ApiProperty({ example: 'money-manager', description: 'money-manager, mbank, pko, zen, ibkr' })
  @IsString()
  @MaxLength(32)
  profile!: string;

  @ApiProperty({ required: false, description: 'the account a bank or broker statement belongs to' })
  @IsOptional()
  @IsString()
  accountId?: string;
}

export class ColumnsDto {
  @ApiProperty() @IsInt() @Min(0) @Max(200) date!: number;
  @ApiProperty() @IsInt() @Min(0) @Max(200) amount!: number;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() @Min(0) @Max(200) account?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() @Min(0) @Max(200) type?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() @Min(0) @Max(200) toAccount?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() @Min(0) @Max(200) toAmount?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() @Min(0) @Max(200) currency?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() @Min(0) @Max(200) toCurrency?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() @Min(0) @Max(200) category?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() @Min(0) @Max(200) subcategory?: number;
  @ApiProperty({ required: false, type: [Number] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsInt({ each: true })
  note?: number[];
}

export class TypeValuesDto {
  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true }) income!: string[];
  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true }) expense!: string[];
  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true }) transfer!: string[];
  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true }) transferOut!: string[];
  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true }) transferIn!: string[];
}

export class MappingDto {
  @ApiProperty({ description: 'index of the header row (0 = first line)' })
  @IsInt()
  @Min(0)
  @Max(1000)
  headerRow!: number;

  @ApiProperty({ type: ColumnsDto })
  @ValidateNested()
  @Type(() => ColumnsDto)
  columns!: ColumnsDto;

  @ApiProperty({ enum: DATE_FORMATS })
  @IsIn(DATE_FORMATS)
  dateFormat!: (typeof DATE_FORMATS)[number];

  @ApiProperty({ enum: ['auto', '.', ','] })
  @IsIn(['auto', '.', ','])
  decimalSeparator!: 'auto' | '.' | ',';

  @ApiProperty({ example: 'PLN' })
  @Matches(CURRENCY_PATTERN)
  defaultCurrency!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  fixedAccountId?: string;

  @ApiProperty({ enum: ['signed', 'type'] })
  @IsIn(['signed', 'type'])
  amountSign!: 'signed' | 'type';

  @ApiProperty({ type: TypeValuesDto })
  @ValidateNested()
  @Type(() => TypeValuesDto)
  typeValues!: TypeValuesDto;

  @ApiProperty({ description: 'account name in the file -> account id', example: { mBank: 'cm...' } })
  @IsObject()
  accounts!: Record<string, string>;
}

export class RowDecisionDto {
  @ApiProperty({ enum: ['ready', 'skipped'] })
  @IsIn(['ready', 'skipped'])
  status!: 'ready' | 'skipped';
}

export class BalanceTargetDto {
  @ApiProperty() @IsString() accountId!: string;
  @ApiProperty({ example: 'PLN' }) @Matches(CURRENCY_PATTERN) currency!: string;
  @ApiProperty({ example: '15844.87', description: 'what the bank shows' })
  @Matches(SIGNED_AMOUNT_PATTERN)
  balance!: string;
  @ApiProperty({ example: '2026-10-28', description: 'the day the bank showed it (default: today)' })
  @IsOptional()
  @Matches(DATE_PATTERN)
  asOf?: string;
}

export class BalanceTargetsDto {
  @ApiProperty({ type: [BalanceTargetDto] })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => BalanceTargetDto)
  targets!: BalanceTargetDto[];
}

export class CreateAccountsDto {
  @ApiProperty({ type: [String], description: 'account names from the file' })
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  names!: string[];

  @ApiProperty({ required: false, example: 'Imported' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  institutionName?: string;
}

export class ImportRowResponse {
  @ApiProperty() id!: string;
  @ApiProperty() rowNumber!: number;
  @ApiProperty({ type: [String] }) raw!: string[];
  @ApiProperty() status!: string;
  @ApiProperty({ nullable: true }) message!: string | null;
  @ApiProperty({ nullable: true }) proposal!: unknown;
  @ApiProperty({ nullable: true }) matchTransactionId!: string | null;
  @ApiProperty({ nullable: true }) transactionId!: string | null;
}

export class BalancePreview {
  @ApiProperty() accountId!: string;
  @ApiProperty() accountName!: string;
  @ApiProperty() currency!: string;
  @ApiProperty({ type: AmountJson, description: 'in the ledger before this import' }) before!: AmountJson;
  @ApiProperty({ type: AmountJson, description: 'what the import adds' }) change!: AmountJson;
  @ApiProperty({ type: AmountJson, description: 'after the import, without an opening balance' }) after!: AmountJson;
  @ApiProperty({ type: AmountJson, nullable: true, description: 'what the bank shows' }) target!: AmountJson | null;
  @ApiProperty({ nullable: true }) asOf!: string | null;
  @ApiProperty({ type: AmountJson, nullable: true, description: 'posted as an opening balance on commit' })
  openingBalance!: AmountJson | null;
  @ApiProperty({ nullable: true, description: 'the day the opening balance is dated' }) openingDate!: string | null;
}

export class ImportBatchResponse {
  @ApiProperty() id!: string;
  @ApiProperty() profile!: string;
  @ApiProperty() fileName!: string;
  @ApiProperty({ nullable: true }) accountId!: string | null;
  @ApiProperty({ nullable: true }) encoding!: string | null;
  @ApiProperty({ enum: ['preview', 'committed'] }) status!: string;
  @ApiProperty() rowCount!: number;
  @ApiProperty({ description: 'rows by status' }) counts!: Record<string, number>;
  @ApiProperty({ nullable: true }) mapping!: unknown;
  @ApiProperty({ nullable: true, description: 'a starting mapping guessed from the header' }) suggestedMapping!: unknown;
  @ApiProperty({ type: [String], description: 'account names found in the file' }) accountNames!: string[];
  @ApiProperty({ type: [String], description: 'values of the type column' }) typeValuesFound!: string[];
  @ApiProperty({ type: 'array', items: { type: 'array', items: { type: 'string' } }, description: 'the first lines of the file' })
  head!: string[][];
  @ApiProperty({ nullable: true }) committedAt!: string | null;
  @ApiProperty() createdAt!: string;
}

export class ImportRowsQuery {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsIn(['pending', 'ready', 'duplicate', 'matched', 'imported', 'skipped', 'error'])
  status?: string;

  @ApiProperty({ required: false, example: '0' })
  @IsOptional()
  @Matches(/^\d{1,6}$/)
  offset?: string;

  @ApiProperty({ required: false, example: '200' })
  @IsOptional()
  @Matches(/^\d{1,4}$/)
  limit?: string;
}

export class ImportRowPage {
  @ApiProperty({ type: [ImportRowResponse] }) items!: ImportRowResponse[];
  @ApiProperty() total!: number;
}

export class CommitResult {
  @ApiProperty() imported!: number;
  @ApiProperty() openingBalances!: number;
  @ApiProperty() categoriesCreated!: number;
}
