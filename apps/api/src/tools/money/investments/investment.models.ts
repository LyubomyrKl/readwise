import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { AmountJson } from '../common/amounts';
import {
  AMOUNT_MESSAGE,
  AMOUNT_PATTERN,
  CURRENCY_PATTERN,
  DATE_PATTERN,
  PERCENT_PATTERN,
  RATE_PATTERN,
  UNITS_PATTERN,
} from '../common/validation';
import { MovementBaseDto } from '../movements/movement.models';

export const VALUATIONS = ['manual', 'price_feed', 'bond_formula'] as const;

// ---- assets and classes -----------------------------------------------------------------

export class ClassShareDto {
  @ApiProperty() @IsString() classId!: string;
  @ApiProperty({ example: '100', description: 'percent of the asset in this class' })
  @Matches(PERCENT_PATTERN)
  percent!: string;
}

export class CreateAssetDto {
  @ApiProperty({ example: 'VWCE', description: 'ticker or short code, shown everywhere' })
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  code!: string;

  @ApiProperty({ example: 'Vanguard FTSE All-World UCITS ETF (Acc)' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'EUR', description: 'the currency its price is quoted in' })
  @Matches(CURRENCY_PATTERN)
  quoteCurrency!: string;

  @ApiProperty({ required: false, example: 'units' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  unitName?: string;

  @ApiProperty({ required: false, example: 'IE00BK5BQT80' })
  @IsOptional()
  @Matches(/^[A-Z]{2}[A-Z0-9]{9}\d$/)
  isin?: string;

  @ApiProperty({ required: false, example: 'VWCE.DE', description: 'symbol at the exchange, for a price feed' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  ticker?: string;

  @ApiProperty({ required: false, enum: VALUATIONS })
  @IsOptional()
  @IsIn(VALUATIONS)
  valuation?: (typeof VALUATIONS)[number];

  @ApiProperty({ required: false, description: 'price feed: { provider, symbol }; bond formula: see core/bonds.ts' })
  @IsOptional()
  @IsObject()
  valuationConfig?: Record<string, unknown>;

  @ApiProperty({ required: false, type: [ClassShareDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ClassShareDto)
  classes?: ClassShareDto[];
}

export class UpdateAssetDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MinLength(1) @MaxLength(20) code?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(40) unitName?: string;
  @ApiProperty({ required: false, nullable: true }) @IsOptional() @IsString() isin?: string | null;
  @ApiProperty({ required: false, nullable: true }) @IsOptional() @IsString() @MaxLength(30) ticker?: string | null;
  @ApiProperty({ required: false, enum: VALUATIONS }) @IsOptional() @IsIn(VALUATIONS) valuation?: (typeof VALUATIONS)[number];
  @ApiProperty({ required: false, nullable: true }) @IsOptional() @IsObject() valuationConfig?: Record<string, unknown> | null;
  @ApiProperty({ required: false }) @IsOptional() @IsBoolean() archived?: boolean;
}

export class ClassSharesDto {
  @ApiProperty({ type: [ClassShareDto] })
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ClassShareDto)
  classes!: ClassShareDto[];
}

export class CreateAssetClassDto {
  @ApiProperty({ example: 'Core equity' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;

  @ApiProperty({ required: false, example: '70', description: 'target percent of the portfolio' })
  @IsOptional()
  @Matches(PERCENT_PATTERN)
  targetPercent?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  sortOrder?: number;
}

export class UpdateAssetClassDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MinLength(1) @MaxLength(60) name?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() @Min(0) @Max(1000) sortOrder?: number;
}

export class TargetDto {
  @ApiProperty({ example: '70' }) @Matches(PERCENT_PATTERN) percent!: string;
  @ApiProperty({ example: '2026-01-01', description: 'from this day on (earlier targets stay as history)' })
  @Matches(DATE_PATTERN)
  validFrom!: string;
}

export class AssetClassResponse {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() sortOrder!: number;
  @ApiProperty({ nullable: true, example: '70' }) targetPercent!: string | null;
  @ApiProperty({ nullable: true }) targetValidFrom!: string | null;
  @ApiProperty({ description: 'every target this class had, newest first' })
  targets!: { percent: string; validFrom: string }[];
}

export class PriceJson {
  @ApiProperty({ example: '123.4500' }) price!: string;
  @ApiProperty({ example: 'EUR' }) currency!: string;
  @ApiProperty({ example: '2026-10-27' }) date!: string;
  @ApiProperty({ enum: ['manual', 'import', 'feed'] }) source!: string;
}

export class AssetResponse {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'VWCE' }) code!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true }) ticker!: string | null;
  @ApiProperty({ nullable: true }) isin!: string | null;
  @ApiProperty() unitName!: string;
  @ApiProperty({ example: 'EUR' }) quoteCurrency!: string;
  @ApiProperty({ enum: VALUATIONS }) valuation!: string;
  @ApiProperty({ nullable: true }) valuationConfig!: unknown;
  @ApiProperty({ type: [ClassShareDto] }) classes!: { classId: string; percent: string }[];
  @ApiProperty({ type: PriceJson, nullable: true }) latestPrice!: PriceJson | null;
  @ApiProperty() archived!: boolean;
}

// ---- prices -----------------------------------------------------------------------------

export class CreatePriceDto {
  @ApiProperty() @IsString() assetId!: string;
  @ApiProperty({ example: '2026-09-30' }) @Matches(DATE_PATTERN) date!: string;
  @ApiProperty({ example: '123.45', description: 'one unit, in the asset quote currency' })
  @Matches(RATE_PATTERN)
  price!: string;
}

export class PriceResponse extends PriceJson {
  @ApiProperty() id!: string;
  @ApiProperty() assetId!: string;
}

// ---- trades (movement kinds) ---------------------------------------------------------------

export class BuyDto extends MovementBaseDto {
  @ApiProperty({ description: 'the account that holds the units' }) @IsString() accountId!: string;
  @ApiProperty() @IsString() assetId!: string;

  @ApiProperty({ example: '10' })
  @Matches(UNITS_PATTERN, { message: 'units must be a positive decimal' })
  units!: string;

  @ApiProperty({ example: '1250.35', description: 'all-in: price times units plus every fee, in the currency paid' })
  @Matches(AMOUNT_PATTERN, { message: `total must be ${AMOUNT_MESSAGE}` })
  total!: string;

  @ApiProperty({ example: 'EUR', description: 'the currency paid' })
  @Matches(CURRENCY_PATTERN)
  currency!: string;

  @ApiProperty({ required: false, description: 'where the money came from (default: the holding account)' })
  @IsOptional()
  @IsString()
  paidFromAccountId?: string;

  @ApiProperty({ required: false, description: 'units held before tracking started: no cash moves, the cost is the opening value' })
  @IsOptional()
  @IsBoolean()
  heldBefore?: boolean;

  @ApiProperty({ required: false, example: '290.10', description: 'what the broker charged in the trade currency, when that differs' })
  @IsOptional()
  @Matches(AMOUNT_PATTERN)
  tradeAmount?: string;

  @ApiProperty({ required: false, example: 'EUR' })
  @IsOptional()
  @Matches(CURRENCY_PATTERN)
  tradeCurrency?: string;
}

export class SellDto extends MovementBaseDto {
  @ApiProperty() @IsString() accountId!: string;
  @ApiProperty() @IsString() assetId!: string;

  @ApiProperty({ example: '5' })
  @Matches(UNITS_PATTERN, { message: 'units must be a positive decimal' })
  units!: string;

  @ApiProperty({ example: '640.10', description: 'what arrived, net of every fee' })
  @Matches(AMOUNT_PATTERN, { message: `proceeds must be ${AMOUNT_MESSAGE}` })
  proceeds!: string;

  @ApiProperty({ example: 'EUR' })
  @Matches(CURRENCY_PATTERN)
  currency!: string;

  @ApiProperty({ required: false, description: 'where the proceeds went (default: the holding account)' })
  @IsOptional()
  @IsString()
  proceedsToAccountId?: string;
}

export class InvestmentIncomeDto extends MovementBaseDto {
  @ApiProperty() @IsString() accountId!: string;

  @ApiProperty({ example: 'USD' })
  @Matches(CURRENCY_PATTERN)
  currency!: string;

  @ApiProperty({ example: '8.50', description: 'what arrived, after tax withheld' })
  @Matches(AMOUNT_PATTERN, { message: `amount must be ${AMOUNT_MESSAGE}` })
  amount!: string;

  @ApiProperty({ required: false, example: '1.50', description: 'tax withheld at source' })
  @IsOptional()
  @Matches(AMOUNT_PATTERN)
  withholding?: string;

  @ApiProperty({ required: false, enum: ['dividend', 'interest', 'other'], description: 'picks the default category' })
  @IsOptional()
  @IsIn(['dividend', 'interest', 'other'])
  incomeType?: 'dividend' | 'interest' | 'other';

  @ApiProperty({ required: false, description: 'the asset that paid it' })
  @IsOptional()
  @IsString()
  assetId?: string;

  @ApiProperty({ required: false }) @IsOptional() @IsString() incomeCategoryId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() taxCategoryId?: string;
}

export class UnitMoveDto extends MovementBaseDto {
  @ApiProperty() @IsString() fromAccountId!: string;
  @ApiProperty() @IsString() toAccountId!: string;
  @ApiProperty() @IsString() assetId!: string;

  @ApiProperty({ example: '10' })
  @Matches(UNITS_PATTERN, { message: 'units must be a positive decimal' })
  units!: string;
}

export class SplitDto extends MovementBaseDto {
  @ApiProperty() @IsString() assetId!: string;

  @ApiProperty({ example: '1', description: 'units before…' })
  @Matches(/^\d{1,6}$/)
  ratioFrom!: string;

  @ApiProperty({ example: '3', description: '…become this many units after' })
  @Matches(/^\d{1,6}$/)
  ratioTo!: string;
}

// ---- positions and lots -------------------------------------------------------------------

export class LotResponse {
  @ApiProperty() id!: string;
  @ApiProperty() accountId!: string;
  @ApiProperty() assetId!: string;
  @ApiProperty({ example: '2025-06-02' }) acquiredAt!: string;
  @ApiProperty({ example: '30' }) units!: string;
  @ApiProperty({ example: '12.5' }) remainingUnits!: string;
  @ApiProperty({ type: AmountJson }) cost!: AmountJson;
  @ApiProperty({ type: AmountJson }) remainingCost!: AmountJson;
  @ApiProperty({ type: AmountJson, nullable: true, description: 'cost in the tax currency (NBP rate of the business day before)' })
  costPln!: AmountJson | null;
  @ApiProperty({ nullable: true }) costPlnRate!: string | null;
  @ApiProperty({ nullable: true }) costPlnRateDate!: string | null;
  @ApiProperty({ type: AmountJson, nullable: true }) tradeCost!: AmountJson | null;
  @ApiProperty() transactionId!: string;
  @ApiProperty({ nullable: true }) parentLotId!: string | null;
  @ApiProperty() closed!: boolean;
}

export class PositionResponse {
  @ApiProperty() accountId!: string;
  @ApiProperty() accountName!: string;
  @ApiProperty() assetId!: string;
  @ApiProperty({ example: 'VWCE' }) code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() unitName!: string;
  @ApiProperty({ example: '71' }) units!: string;
  @ApiProperty({ type: [AmountJson], description: 'cost of the units held, per currency paid (usually one)' }) cost!: AmountJson[];
  @ApiProperty({ nullable: true, example: '119.4512', description: 'cost per unit, when paid in one currency' })
  averageCost!: string | null;
  @ApiProperty({ type: PriceJson, nullable: true }) price!: PriceJson | null;
  @ApiProperty({ type: AmountJson, nullable: true, description: 'market value (price or bond formula)' }) value!: AmountJson | null;
  @ApiProperty({ type: AmountJson, nullable: true, description: 'value minus cost, when both are in one currency' }) gain!: AmountJson | null;
  @ApiProperty({ nullable: true, example: '12.3' }) gainPercent!: string | null;
  @ApiProperty({ enum: ['price', 'bond_formula', 'cost', 'none'] }) valuedBy!: string;
  @ApiProperty({ description: 'the bond formula guessed an inflation figure it does not have' }) estimated!: boolean;
  @ApiProperty() lots!: number;
}

export class PositionsQuery {
  @ApiProperty({ required: false }) @IsOptional() @IsString() accountId?: string;
  @ApiProperty({ required: false, example: '2026-09-30', description: 'positions and values at the end of this day' })
  @IsOptional()
  @Matches(DATE_PATTERN)
  asOf?: string;
}

export class LotsQuery {
  @ApiProperty({ required: false }) @IsOptional() @IsString() accountId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() assetId?: string;
  @ApiProperty({ required: false, description: 'only lots with units left' }) @IsOptional() @IsIn(['true', 'false']) open?: string;
}
