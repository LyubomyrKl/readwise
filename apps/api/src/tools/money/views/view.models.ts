import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { AmountJson } from '../common/amounts';
import { CURRENCY_PATTERN, DATE_PATTERN } from '../common/validation';

export class ViewQuery {
  @ApiProperty({ required: false, example: 'EUR', description: 'any supported currency; default: the base currency in settings' })
  @IsOptional()
  @Matches(CURRENCY_PATTERN)
  base?: string;

  @ApiProperty({ required: false, example: '2026-09-30', description: 'at the end of this day; default today' })
  @IsOptional()
  @Matches(DATE_PATTERN)
  asOf?: string;
}

export class RangeQuery {
  @ApiProperty({ required: false, example: 'EUR' })
  @IsOptional()
  @Matches(CURRENCY_PATTERN)
  base?: string;

  @ApiProperty({ required: false, example: '2025-11', description: 'first month (YYYY-MM) or `start` for the first transaction; default: 11 months before `to`' })
  @IsOptional()
  @Matches(/^(\d{4}-\d{2}|start)$/)
  from?: string;

  @ApiProperty({ required: false, example: '2026-10', description: 'last month (YYYY-MM); default: this month' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/)
  to?: string;
}

export class NetWorthItem {
  @ApiProperty({ example: 'PLN' }) code!: string;
  @ApiProperty({ enum: ['cash', 'asset'] }) kind!: 'cash' | 'asset';
  @ApiProperty({ type: AmountJson, nullable: true, description: 'cash balance, or the asset value in its currency' }) native!: AmountJson | null;
  @ApiProperty({ nullable: true }) units!: string | null;
  @ApiProperty({ type: AmountJson, nullable: true, description: 'in the base currency; null without a rate' }) value!: AmountJson | null;
  @ApiProperty({ enum: ['balance', 'price', 'bond_formula', 'cost', 'none'] }) valuedBy!: string;
}

export class NetWorthAccount {
  @ApiProperty() accountId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true }) institution!: string | null;
  @ApiProperty({ enum: ['bank', 'investment', 'bonds', 'debt'] }) type!: string;
  @ApiProperty({ type: AmountJson }) value!: AmountJson;
  @ApiProperty({ type: [NetWorthItem] }) items!: NetWorthItem[];
}

export class NamedValue {
  @ApiProperty({ nullable: true }) key!: string | null;
  @ApiProperty() name!: string;
  @ApiProperty({ type: AmountJson }) value!: AmountJson;
  @ApiProperty({ type: AmountJson, nullable: true, description: 'in its own currency (by currency only)' }) native!: AmountJson | null;
}

export class NetWorthResponse {
  @ApiProperty({ example: 'PLN' }) base!: string;
  @ApiProperty({ example: '2026-10-28' }) asOf!: string;
  @ApiProperty({ type: AmountJson }) total!: AmountJson;
  @ApiProperty({ type: AmountJson }) assets!: AmountJson;
  @ApiProperty({ type: AmountJson, description: 'debts, negative' }) liabilities!: AmountJson;
  @ApiProperty({ type: [NetWorthAccount] }) accounts!: NetWorthAccount[];
  @ApiProperty({ type: [NamedValue] }) currencies!: NamedValue[];
  @ApiProperty({ type: [NamedValue] }) types!: NamedValue[];
  @ApiProperty({ type: [NamedValue] }) classes!: NamedValue[];
  @ApiProperty({ type: [String], description: 'currencies without a rate to the base currency; left out of the totals' })
  missingRates!: string[];
  @ApiProperty({ nullable: true, description: 'the oldest exchange rate used' }) rateDate!: string | null;
}

export class AllocationRowResponse {
  @ApiProperty({ nullable: true }) classId!: string | null;
  @ApiProperty() name!: string;
  @ApiProperty({ type: AmountJson }) value!: AmountJson;
  @ApiProperty({ nullable: true, example: '62.4' }) percent!: string | null;
  @ApiProperty({ nullable: true, example: '70' }) targetPercent!: string | null;
  @ApiProperty({ nullable: true, example: '-7.6', description: 'percentage points above (+) or below (-) target' }) drift!: string | null;
  @ApiProperty({ type: AmountJson, nullable: true, description: 'to buy (-) or above target (+)' }) driftAmount!: AmountJson | null;
}

export class AllocationResponse {
  @ApiProperty() base!: string;
  @ApiProperty() asOf!: string;
  @ApiProperty({ type: AmountJson }) total!: AmountJson;
  @ApiProperty({ type: [AllocationRowResponse] }) rows!: AllocationRowResponse[];
  @ApiProperty({ nullable: true, description: 'sum of the current targets' }) targetsTotal!: string | null;
  @ApiProperty({ type: [String] }) missingRates!: string[];
}

export class MonthFlow {
  @ApiProperty({ example: '2026-10' }) month!: string;
  @ApiProperty({ type: AmountJson }) income!: AmountJson;
  @ApiProperty({ type: AmountJson }) expenses!: AmountJson;
  @ApiProperty({ type: AmountJson, description: 'moved from spending accounts into investments, at cost' }) invested!: AmountJson;
  @ApiProperty({ type: AmountJson, description: 'income minus expenses' }) savings!: AmountJson;
  @ApiProperty({ nullable: true, example: '42.3', description: 'percent of income not spent' }) savingsRate!: string | null;
}

export class MonthlyResponse {
  @ApiProperty() base!: string;
  @ApiProperty({ type: [MonthFlow] }) months!: MonthFlow[];
  @ApiProperty({ type: [String] }) missingRates!: string[];
}

export class CategoryValue {
  @ApiProperty({ nullable: true }) categoryId!: string | null;
  @ApiProperty() name!: string;
  @ApiProperty({ type: AmountJson }) value!: AmountJson;
  @ApiProperty({ nullable: true, example: '23.1', description: 'percent of the month total' }) percent!: string | null;
}

export class MonthDetail extends MonthFlow {
  @ApiProperty() base!: string;
  @ApiProperty({ type: [CategoryValue] }) expensesByCategory!: CategoryValue[];
  @ApiProperty({ type: [CategoryValue] }) incomeByCategory!: CategoryValue[];
  @ApiProperty({ type: [String] }) missingRates!: string[];
}

/** A whole period (several months) the way MonthDetail shows one month. */
export class PeriodDetail {
  @ApiProperty({ example: '2025-11' }) from!: string;
  @ApiProperty({ example: '2026-10' }) to!: string;
  @ApiProperty() base!: string;
  @ApiProperty({ type: AmountJson }) income!: AmountJson;
  @ApiProperty({ type: AmountJson }) expenses!: AmountJson;
  @ApiProperty({ type: AmountJson }) invested!: AmountJson;
  @ApiProperty({ type: AmountJson }) savings!: AmountJson;
  @ApiProperty({ nullable: true, example: '48.1' }) savingsRate!: string | null;
  @ApiProperty({ type: [CategoryValue] }) expensesByCategory!: CategoryValue[];
  @ApiProperty({ type: [CategoryValue] }) incomeByCategory!: CategoryValue[];
  @ApiProperty({ type: [String] }) missingRates!: string[];
}

export class HistoryPoint {
  @ApiProperty({ example: '2026-09-30' }) date!: string;
  @ApiProperty({ type: AmountJson }) total!: AmountJson;
  @ApiProperty({ type: AmountJson }) assets!: AmountJson;
  @ApiProperty({ type: AmountJson }) liabilities!: AmountJson;
}

export class HistoryResponse {
  @ApiProperty() base!: string;
  @ApiProperty({ type: [HistoryPoint] }) points!: HistoryPoint[];
  @ApiProperty({ type: [String] }) missingRates!: string[];
}

export class HomeResponse {
  @ApiProperty() base!: string;
  @ApiProperty({ type: NetWorthResponse }) netWorth!: NetWorthResponse;
  @ApiProperty({ type: MonthDetail }) month!: MonthDetail;
  @ApiProperty({ type: AllocationResponse }) allocation!: AllocationResponse;
  @ApiProperty({ description: 'drafts waiting for approval' }) drafts!: number;
}

export class CreateSnapshotDto {
  @ApiProperty({ required: false, example: '2026-09-30', description: 'default: today' })
  @IsOptional()
  @Matches(DATE_PATTERN)
  date?: string;

  @ApiProperty({ required: false, example: 'Q3 2026' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  label?: string;
}

export class SnapshotResponse {
  @ApiProperty() id!: string;
  @ApiProperty({ example: '2026-09-30' }) date!: string;
  @ApiProperty({ nullable: true }) label!: string | null;
  @ApiProperty({ type: AmountJson }) netWorth!: AmountJson;
  @ApiProperty({ description: 'net worth, positions and allocation as they were' }) data!: unknown;
  @ApiProperty() createdAt!: string;
}
