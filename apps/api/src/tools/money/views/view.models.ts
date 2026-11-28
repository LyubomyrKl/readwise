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

/** Income or expenses in a category left out of the totals (a one-off such as selling a car). */
export class LeftOutValue {
  @ApiProperty({ nullable: true }) categoryId!: string | null;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ['income', 'expense'] }) kind!: 'income' | 'expense';
  @ApiProperty({ type: AmountJson }) value!: AmountJson;
}

export class MonthDetail extends MonthFlow {
  @ApiProperty() base!: string;
  @ApiProperty({ type: [CategoryValue] }) expensesByCategory!: CategoryValue[];
  @ApiProperty({ type: [CategoryValue] }) incomeByCategory!: CategoryValue[];
  @ApiProperty({ type: [LeftOutValue], description: 'categories left out of income, expenses and the savings rate' })
  leftOutByCategory!: LeftOutValue[];
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
  @ApiProperty({ type: [LeftOutValue], description: 'categories left out of income, expenses and the savings rate' })
  leftOutByCategory!: LeftOutValue[];
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

// ---- forecast ---------------------------------------------------------------------------------

export class PaceResponse {
  @ApiProperty({ type: AmountJson }) soFar!: AmountJson;
  @ApiProperty({ type: AmountJson, nullable: true, description: 'where the months before usually stood by this day (median)' })
  typicalByNow!: AmountJson | null;
  @ApiProperty({ type: AmountJson, description: 'so far plus what usually follows after this day (median)' }) projected!: AmountJson;
  @ApiProperty({ type: AmountJson, description: 'likely range: the quartiles of what followed' }) low!: AmountJson;
  @ApiProperty({ type: AmountJson }) high!: AmountJson;
  @ApiProperty({ type: AmountJson, nullable: true, description: 'the median whole month' }) typicalMonth!: AmountJson | null;
  @ApiProperty({ nullable: true, example: '23.4', description: 'projected against the usual month, percent' }) change!: string | null;
}

export class PaceDay {
  @ApiProperty({ example: 12 }) day!: number;
  @ApiProperty({ type: AmountJson, nullable: true, description: 'running total this month; null after today' }) actual!: AmountJson | null;
  @ApiProperty({ type: AmountJson, nullable: true, description: 'the usual running total (median of the months before)' })
  typical!: AmountJson | null;
  @ApiProperty({ type: AmountJson, nullable: true }) low!: AmountJson | null;
  @ApiProperty({ type: AmountJson, nullable: true }) high!: AmountJson | null;
}

export class CategoryPace extends PaceResponse {
  @ApiProperty({ nullable: true }) categoryId!: string | null;
  @ApiProperty() name!: string;
}

export class YearFigures {
  @ApiProperty({ type: AmountJson }) income!: AmountJson;
  @ApiProperty({ type: AmountJson }) expenses!: AmountJson;
  @ApiProperty({ type: AmountJson }) savings!: AmountJson;
  @ApiProperty({ nullable: true, example: '31.5' }) savingsRate!: string | null;
}

export class LastYearFigures extends YearFigures {
  @ApiProperty({ example: 12, description: 'months of last year with any movement' }) months!: number;
}

export class YearOutlook {
  @ApiProperty({ example: 2026 }) year!: number;
  @ApiProperty({ type: YearFigures }) soFar!: YearFigures;
  @ApiProperty({ type: YearFigures, description: 'so far, the rest of this month as projected, a usual month for each month left' })
  projected!: YearFigures;
  @ApiProperty({ type: LastYearFigures, nullable: true }) lastYear!: LastYearFigures | null;
}

export class OutlookPoint {
  @ApiProperty({ example: '2027-03-31' }) date!: string;
  @ApiProperty({ type: AmountJson }) value!: AmountJson;
  @ApiProperty({ type: AmountJson }) low!: AmountJson;
  @ApiProperty({ type: AmountJson }) high!: AmountJson;
}

export class NetWorthOutlookResponse {
  @ApiProperty({ type: [HistoryPoint], description: 'month ends up to today' }) history!: HistoryPoint[];
  @ApiProperty({ type: AmountJson, nullable: true, description: 'average change a month over the last year' }) monthlyChange!: AmountJson | null;
  @ApiProperty({ type: [OutlookPoint], description: 'the next twelve month ends at that pace; empty with under four month ends' })
  projection!: OutlookPoint[];
}

export class RunwayResponse {
  @ApiProperty({ type: AmountJson, description: 'bank and cash' }) liquid!: AmountJson;
  @ApiProperty({ type: AmountJson, nullable: true, description: 'the median month of spending' }) monthlyExpenses!: AmountJson | null;
  @ApiProperty({ nullable: true, example: '7.4', description: 'months of usual spending it covers' }) months!: string | null;
}

export class UpcomingMovement {
  @ApiProperty({ example: '2026-11-30' }) date!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ example: 'expense' }) kind!: string;
  @ApiProperty({ type: AmountJson, nullable: true, description: 'in its own currency' }) amount!: AmountJson | null;
}

export class ForecastResponse {
  @ApiProperty() base!: string;
  @ApiProperty({ example: '2026-11-28' }) asOf!: string;
  @ApiProperty({ example: '2026-11' }) month!: string;
  @ApiProperty({ example: 28 }) day!: number;
  @ApiProperty({ example: 30 }) daysInMonth!: number;
  @ApiProperty({ enum: ['history', 'pace'], description: 'history: against the months before; pace: a straight line (under three months of history)' })
  method!: 'history' | 'pace';
  @ApiProperty({ example: 12, description: 'months before this one the forecast compares with' }) basisMonths!: number;
  @ApiProperty({ type: PaceResponse }) expenses!: PaceResponse;
  @ApiProperty({ type: PaceResponse }) income!: PaceResponse;
  @ApiProperty({ type: AmountJson, description: 'projected income minus projected expenses' }) savings!: AmountJson;
  @ApiProperty({ nullable: true, example: '28.0' }) savingsRate!: string | null;
  @ApiProperty({ type: [PaceDay], description: "expenses' running total by day: this month against the usual" }) days!: PaceDay[];
  @ApiProperty({ type: [CategoryPace], description: 'expense categories, the furthest from usual first' }) categories!: CategoryPace[];
  @ApiProperty({ type: YearOutlook }) year!: YearOutlook;
  @ApiProperty({ type: NetWorthOutlookResponse }) netWorth!: NetWorthOutlookResponse;
  @ApiProperty({ type: RunwayResponse }) runway!: RunwayResponse;
  @ApiProperty({ type: [UpcomingMovement], description: 'recurring movements due after today this month' }) upcoming!: UpcomingMovement[];
  @ApiProperty({ type: [String] }) missingRates!: string[];
}
