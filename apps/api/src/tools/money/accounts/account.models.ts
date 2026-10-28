import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { AmountJson } from '../common/amounts';
import { CURRENCY_PATTERN, DATE_MESSAGE, DATE_PATTERN, SIGNED_AMOUNT_PATTERN, AMOUNT_MESSAGE } from '../common/validation';

export const INSTITUTION_KINDS = ['bank', 'broker', 'bond_registry', 'lender', 'cash'] as const;
export const ACCOUNT_TYPES = ['bank', 'investment', 'bonds', 'debt'] as const;
export const TAX_WRAPPERS = ['taxable', 'tax_advantaged'] as const;
export const COST_BASIS_METHODS = ['fifo', 'average'] as const;

export class InstitutionResponse {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'mBank' }) name!: string;
  @ApiProperty({ enum: INSTITUTION_KINDS }) kind!: string;
}

export class CreateInstitutionDto {
  @ApiProperty({ example: 'mBank' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @ApiProperty({ enum: INSTITUTION_KINDS })
  @IsIn(INSTITUTION_KINDS)
  kind!: (typeof INSTITUTION_KINDS)[number];
}

export class UpdateInstitutionDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @ApiProperty({ required: false, enum: INSTITUTION_KINDS })
  @IsOptional()
  @IsIn(INSTITUTION_KINDS)
  kind?: (typeof INSTITUTION_KINDS)[number];
}

export class OpeningBalanceInput {
  @ApiProperty({ example: 'PLN' })
  @Matches(CURRENCY_PATTERN)
  currency!: string;

  @ApiProperty({ example: '1234.56', description: 'negative for money owed' })
  @Matches(SIGNED_AMOUNT_PATTERN, { message: `amount must be ${AMOUNT_MESSAGE}` })
  amount!: string;

  @ApiProperty({ example: '2026-01-01' })
  @Matches(DATE_PATTERN, { message: `date must be ${DATE_MESSAGE}` })
  date!: string;
}

export class CreateAccountDto {
  @ApiProperty({ description: 'institution id' })
  @IsString()
  institutionId!: string;

  @ApiProperty({ example: 'eKonto' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @ApiProperty({ enum: ACCOUNT_TYPES })
  @IsIn(ACCOUNT_TYPES)
  type!: (typeof ACCOUNT_TYPES)[number];

  @ApiProperty({ required: false, enum: TAX_WRAPPERS })
  @IsOptional()
  @IsIn(TAX_WRAPPERS)
  taxWrapper?: (typeof TAX_WRAPPERS)[number];

  @ApiProperty({ required: false, enum: COST_BASIS_METHODS, nullable: true })
  @IsOptional()
  @IsIn(COST_BASIS_METHODS)
  costBasisMethod?: (typeof COST_BASIS_METHODS)[number] | null;

  @ApiProperty({ example: ['PLN', 'USD'], description: 'one sub-account per currency' })
  @IsArray()
  @ArrayMaxSize(40)
  @Matches(CURRENCY_PATTERN, { each: true })
  currencies!: string[];

  @ApiProperty({ required: false, type: [OpeningBalanceInput] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OpeningBalanceInput)
  openingBalances?: OpeningBalanceInput[];

  @ApiProperty({ required: false, description: 'IBAN or account number as statements print it' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  number?: string;

  @ApiProperty({ required: false, description: 'asset class the cash counts in' })
  @IsOptional()
  @IsString()
  cashClassId?: string;

  @ApiProperty({ required: false, example: 'mbank' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  importProfile?: string;
}

export class UpdateAccountDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  institutionId?: string;

  @ApiProperty({ required: false, enum: ACCOUNT_TYPES })
  @IsOptional()
  @IsIn(ACCOUNT_TYPES)
  type?: (typeof ACCOUNT_TYPES)[number];

  @ApiProperty({ required: false, enum: TAX_WRAPPERS })
  @IsOptional()
  @IsIn(TAX_WRAPPERS)
  taxWrapper?: (typeof TAX_WRAPPERS)[number];

  @ApiProperty({ required: false, enum: COST_BASIS_METHODS, nullable: true })
  @IsOptional()
  @IsIn([...COST_BASIS_METHODS, null])
  costBasisMethod?: (typeof COST_BASIS_METHODS)[number] | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  number?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  cashClassId?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  importProfile?: string | null;
}

export class AddCurrencyDto {
  @ApiProperty({ example: 'EUR' })
  @Matches(CURRENCY_PATTERN)
  currency!: string;
}

export class ListAccountsQuery {
  @ApiProperty({ required: false, description: 'include archived accounts' })
  @IsOptional()
  @IsIn(['true', 'false'])
  archived?: string;

  @ApiProperty({ required: false, example: '2026-10-28', description: 'balances at the end of this day' })
  @IsOptional()
  @Matches(DATE_PATTERN)
  asOf?: string;
}

export class SubAccountBalance {
  @ApiProperty() subAccountId!: string;
  @ApiProperty({ example: 'PLN', description: 'currency code or asset id' }) commodityId!: string;
  @ApiProperty({ example: 'PLN', description: 'currency code or asset ticker' }) code!: string;
  @ApiProperty({ enum: ['currency', 'asset'] }) kind!: 'currency' | 'asset';
  @ApiProperty({ type: AmountJson, nullable: true }) balance!: AmountJson | null;
  @ApiProperty({ nullable: true, example: '71.5' }) units!: string | null;
}

export class AccountResponse {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ACCOUNT_TYPES }) type!: string;
  @ApiProperty({ type: InstitutionResponse, nullable: true }) institution!: InstitutionResponse | null;
  @ApiProperty({ enum: TAX_WRAPPERS }) taxWrapper!: string;
  @ApiProperty({ enum: COST_BASIS_METHODS, nullable: true }) costBasisMethod!: string | null;
  @ApiProperty({ nullable: true }) cashClassId!: string | null;
  @ApiProperty({ nullable: true }) number!: string | null;
  @ApiProperty({ nullable: true }) importProfile!: string | null;
  @ApiProperty({ nullable: true }) archivedAt!: string | null;
  @ApiProperty({ type: [SubAccountBalance] }) balances!: SubAccountBalance[];
}

export class ArchiveDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}
