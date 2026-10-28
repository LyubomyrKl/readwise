/**
 * Shapes of the money API (apps/api/src/tools/money). Amounts and units are
 * exact decimal strings; the web app formats them and never adds them up.
 */

export interface AmountJson {
  currency: string;
  /** integer, minor units */
  minor: string;
  /** exact decimal */
  value: string;
}

export interface CurrencyResponse {
  code: string;
  name: string;
  decimals: number;
}

export type InstitutionKind = "bank" | "broker" | "bond_registry" | "lender" | "cash";
export type AccountType = "bank" | "investment" | "bonds" | "debt";
export type TaxWrapper = "taxable" | "tax_advantaged";
export type CostBasisMethod = "fifo" | "average";

export interface InstitutionResponse {
  id: string;
  name: string;
  kind: InstitutionKind;
}

export interface SubAccountBalance {
  subAccountId: string;
  commodityId: string;
  code: string;
  kind: "currency" | "asset";
  balance: AmountJson | null;
  units: string | null;
}

export interface AccountResponse {
  id: string;
  name: string;
  type: AccountType;
  institution: InstitutionResponse | null;
  taxWrapper: TaxWrapper;
  costBasisMethod: CostBasisMethod | null;
  cashClassId: string | null;
  number: string | null;
  importProfile: string | null;
  archivedAt: string | null;
  balances: SubAccountBalance[];
}

export interface CreateAccountInput {
  institutionId: string;
  name: string;
  type: AccountType;
  taxWrapper?: TaxWrapper;
  costBasisMethod?: CostBasisMethod | null;
  currencies: string[];
  openingBalances?: { currency: string; amount: string; date: string }[];
  number?: string;
  cashClassId?: string;
  importProfile?: string;
}

export type UpdateAccountInput = Partial<
  Omit<CreateAccountInput, "currencies" | "openingBalances" | "number" | "cashClassId" | "importProfile">
> & {
  number?: string | null;
  cashClassId?: string | null;
  importProfile?: string | null;
};

export interface CategoryResponse {
  id: string;
  name: string;
  kind: "income" | "expense";
  parentId: string | null;
  key: string | null;
  archived: boolean;
}

export interface MoneySettings {
  baseCurrency: string;
  defaultCostBasis: CostBasisMethod;
  taxResidence: string;
}

export type MovementKind =
  | "income"
  | "expense"
  | "transfer"
  | "opening_balance"
  | "fee"
  | "buy"
  | "sell"
  | "investment_income"
  | "unit_move"
  | "split";

export type TransactionKind = MovementKind | "correction";

export interface EntryResponse {
  id: string;
  accountId: string;
  accountName: string;
  accountType: AccountType | "system";
  systemRole: "income" | "expense" | "opening_balance" | "conversion" | null;
  commodityId: string;
  code: string;
  amount: AmountJson | null;
  units: string | null;
  categoryId: string | null;
  categoryName: string | null;
}

export interface TransactionResponse {
  id: string;
  date: string;
  kind: TransactionKind;
  status: "posted" | "draft";
  note: string | null;
  category: { id: string; name: string } | null;
  asset: { id: string; name: string } | null;
  correctsId: string | null;
  reversedBy: string | null;
  replacedBy: string | null;
  proposedBy: string | null;
  impliedRate: string | null;
  draft: { kind: MovementKind; input: Record<string, unknown> } | null;
  entries: EntryResponse[];
  createdAt: string;
  postedAt: string | null;
}

export interface TransactionPage {
  items: TransactionResponse[];
  nextCursor: string | null;
}

export interface TransactionFilters {
  from?: string;
  to?: string;
  accountId?: string;
  categoryId?: string;
  assetId?: string;
  kind?: string;
  q?: string;
  limit?: number;
  before?: string;
}

export interface Movement {
  kind: MovementKind;
  input: Record<string, unknown>;
}

// ---- imports ---------------------------------------------------------------------------

export interface ImportProfileInfo {
  id: string;
  label: string;
  needsAccount: boolean;
  needsMapping: boolean;
}

export interface ImportColumns {
  date: number;
  amount: number;
  account?: number;
  type?: number;
  toAccount?: number;
  toAmount?: number;
  currency?: number;
  toCurrency?: number;
  category?: number;
  subcategory?: number;
  note?: number[];
}

export interface ImportTypeValues {
  income: string[];
  expense: string[];
  transfer: string[];
  transferOut: string[];
  transferIn: string[];
}

export interface ImportMapping {
  headerRow: number;
  columns: ImportColumns;
  dateFormat: string;
  decimalSeparator: "auto" | "." | ",";
  defaultCurrency: string;
  fixedAccountId?: string;
  amountSign: "signed" | "type";
  typeValues: ImportTypeValues;
  accounts: Record<string, string>;
}

export type ImportRowStatus = "pending" | "ready" | "duplicate" | "matched" | "imported" | "skipped" | "error";

export interface ImportBatch {
  id: string;
  profile: string;
  fileName: string;
  accountId: string | null;
  encoding: string | null;
  status: "preview" | "committed";
  rowCount: number;
  counts: Partial<Record<ImportRowStatus, number>>;
  mapping: ImportMapping | null;
  suggestedMapping: ImportMapping | null;
  accountNames: string[];
  typeValuesFound: string[];
  head: string[][];
  committedAt: string | null;
  createdAt: string;
}

export interface ImportProposal {
  kind: MovementKind;
  input: Record<string, string>;
  category?: { name: string; parent?: string; kind: "income" | "expense" };
  asset?: { ticker: string; currency: string; name?: string; isin?: string };
  /** half of a transfer: compared with the ledger, never posted from the import */
  matchOnly?: boolean;
}

export interface ImportRow {
  id: string;
  rowNumber: number;
  raw: string[];
  status: ImportRowStatus;
  message: string | null;
  proposal: ImportProposal | null;
  matchTransactionId: string | null;
  transactionId: string | null;
}

export interface ImportRowPage {
  items: ImportRow[];
  total: number;
}

export interface BalancePreview {
  accountId: string;
  accountName: string;
  currency: string;
  before: AmountJson;
  change: AmountJson;
  after: AmountJson;
  target: AmountJson | null;
  asOf: string | null;
  openingBalance: AmountJson | null;
  openingDate: string | null;
}

export interface BalanceTarget {
  accountId: string;
  currency: string;
  balance: string;
  asOf?: string;
}

// ---- investments ------------------------------------------------------------------------

export type Valuation = "manual" | "price_feed" | "bond_formula";

export interface PriceJson {
  price: string;
  currency: string;
  date: string;
  source: "manual" | "import" | "feed";
}

export interface AssetResponse {
  id: string;
  code: string;
  name: string;
  ticker: string | null;
  isin: string | null;
  unitName: string;
  quoteCurrency: string;
  valuation: Valuation;
  valuationConfig: Record<string, unknown> | null;
  classes: { classId: string; percent: string }[];
  latestPrice: PriceJson | null;
  archived: boolean;
}

export interface CreateAssetInput {
  code: string;
  name: string;
  quoteCurrency: string;
  unitName?: string;
  isin?: string;
  ticker?: string;
  valuation?: Valuation;
  valuationConfig?: Record<string, unknown>;
  classes?: { classId: string; percent: string }[];
}

export interface AssetClassResponse {
  id: string;
  name: string;
  sortOrder: number;
  targetPercent: string | null;
  targetValidFrom: string | null;
  targets: { percent: string; validFrom: string }[];
}

export interface PriceResponse extends PriceJson {
  id: string;
  assetId: string;
}

export interface PositionResponse {
  accountId: string;
  accountName: string;
  assetId: string;
  code: string;
  name: string;
  unitName: string;
  units: string;
  cost: AmountJson[];
  averageCost: string | null;
  price: PriceJson | null;
  value: AmountJson | null;
  gain: AmountJson | null;
  gainPercent: string | null;
  valuedBy: "price" | "bond_formula" | "cost" | "none";
  estimated: boolean;
  lots: number;
}

export interface LotResponse {
  id: string;
  accountId: string;
  assetId: string;
  acquiredAt: string;
  units: string;
  remainingUnits: string;
  cost: AmountJson;
  remainingCost: AmountJson;
  costPln: AmountJson | null;
  costPlnRate: string | null;
  costPlnRateDate: string | null;
  tradeCost: AmountJson | null;
  transactionId: string;
  parentLotId: string | null;
  closed: boolean;
}

// ---- views ---------------------------------------------------------------------------

export interface NetWorthItem {
  code: string;
  kind: "cash" | "asset";
  /** cash balance, or the asset value in its currency */
  native: AmountJson | null;
  units: string | null;
  /** in the base currency; null without a rate */
  value: AmountJson | null;
  valuedBy: "balance" | "price" | "bond_formula" | "cost" | "none";
}

export interface NetWorthAccount {
  accountId: string;
  name: string;
  institution: string | null;
  type: AccountType;
  value: AmountJson;
  items: NetWorthItem[];
}

export interface NamedValue {
  key: string | null;
  name: string;
  value: AmountJson;
  native: AmountJson | null;
}

export interface NetWorthResponse {
  base: string;
  asOf: string;
  total: AmountJson;
  assets: AmountJson;
  liabilities: AmountJson;
  accounts: NetWorthAccount[];
  currencies: NamedValue[];
  types: NamedValue[];
  classes: NamedValue[];
  /** currencies without a rate to the base currency; left out of the totals */
  missingRates: string[];
  rateDate: string | null;
}

export interface AllocationRow {
  classId: string | null;
  name: string;
  value: AmountJson;
  percent: string | null;
  targetPercent: string | null;
  /** percentage points above (+) or below (-) target */
  drift: string | null;
  /** above (+) or below (-) the target amount */
  driftAmount: AmountJson | null;
}

export interface AllocationResponse {
  base: string;
  asOf: string;
  total: AmountJson;
  rows: AllocationRow[];
  targetsTotal: string | null;
  missingRates: string[];
}

export interface MonthFlow {
  month: string;
  income: AmountJson;
  expenses: AmountJson;
  invested: AmountJson;
  savings: AmountJson;
  savingsRate: string | null;
}

export interface MonthlyResponse {
  base: string;
  months: MonthFlow[];
  missingRates: string[];
}

export interface CategoryValue {
  categoryId: string | null;
  name: string;
  value: AmountJson;
  percent: string | null;
}

export interface MonthDetail extends MonthFlow {
  base: string;
  expensesByCategory: CategoryValue[];
  incomeByCategory: CategoryValue[];
  missingRates: string[];
}

export interface HistoryPoint {
  date: string;
  total: AmountJson;
  assets: AmountJson;
  liabilities: AmountJson;
}

export interface HistoryResponse {
  base: string;
  points: HistoryPoint[];
  missingRates: string[];
}

export interface HomeResponse {
  base: string;
  netWorth: NetWorthResponse;
  month: MonthDetail;
  allocation: AllocationResponse;
  drafts: number;
}

export interface SnapshotResponse {
  id: string;
  date: string;
  label: string | null;
  netWorth: AmountJson;
  /** what the snapshot froze; null in lists */
  data: { netWorth: NetWorthResponse; allocation: AllocationResponse; positions: PositionResponse[] } | null;
  createdAt: string;
}

// ---- recurring -----------------------------------------------------------------------

export type RecurringKind = "income" | "expense" | "fee" | "transfer" | "buy" | "sell" | "investment_income";

export interface RecurringRule {
  id: string;
  name: string;
  kind: RecurringKind;
  /** the movement without its date */
  template: Record<string, unknown>;
  /** FREQ=MONTHLY;BYMONTHDAY=10 and the like */
  schedule: string;
  startDate: string;
  endDate: string | null;
  nextRunAt: string;
  upcoming: string[];
  autoPost: boolean;
  paused: boolean;
  finished: boolean;
  lastRunAt: string | null;
  runs: number;
  createdAt: string;
}

export interface CreateRecurringInput {
  name: string;
  kind: RecurringKind;
  template: Record<string, unknown>;
  schedule: string;
  startDate: string;
  endDate?: string | null;
  autoPost?: boolean;
}

export interface RecurringRunResult {
  posted: number;
  drafted: number;
  errors: { ruleId: string; name: string; date: string; error: string }[];
}

// ---- tax -----------------------------------------------------------------------------

export interface TaxLotLine {
  lotId: string;
  acquiredAt: string;
  units: string;
  cost: AmountJson;
  costPln: AmountJson | null;
  rate: string | null;
  rateDate: string | null;
}

export interface TaxSale {
  transactionId: string;
  date: string;
  accountName: string;
  assetCode: string;
  assetName: string;
  units: string;
  proceeds: AmountJson;
  proceedsPln: AmountJson | null;
  rate: string | null;
  rateDate: string | null;
  costPln: AmountJson | null;
  gainPln: AmountJson | null;
  lots: TaxLotLine[];
}

export interface TaxIncome {
  transactionId: string;
  date: string;
  accountName: string;
  assetCode: string | null;
  category: string;
  gross: AmountJson;
  withheld: AmountJson;
  grossPln: AmountJson | null;
  withheldPln: AmountJson | null;
  rate: string | null;
  rateDate: string | null;
  taxPln: AmountJson | null;
  creditPln: AmountJson | null;
}

export interface TaxReport {
  year: number;
  currency: string;
  accounts: { id: string; name: string }[];
  sales: TaxSale[];
  income: TaxIncome[];
  totals: {
    revenue: AmountJson;
    costs: AmountJson;
    income: AmountJson;
    base: AmountJson;
    tax: AmountJson;
    incomeGross: AmountJson;
    incomeTax: AmountJson;
    incomeCredit: AmountJson;
    incomeDue: AmountJson;
  };
  complete: boolean;
  missing: string[];
}

// ---- rates and automation ------------------------------------------------------------

export interface RateRow {
  id: string;
  date: string;
  from: string;
  to: string;
  rate: string;
  source: "ecb" | "nbp" | "manual";
}

export interface RateSourceStatus {
  source: "ecb" | "nbp" | "manual";
  first: string | null;
  latest: string | null;
  count: number;
}

export type MoneyTask = "recurring" | "snapshot" | "rates" | "prices";

export interface AutomationJob {
  id: string;
  type: string;
  status: "queued" | "running" | "waiting" | "succeeded" | "failed" | "cancelled";
  error?: string | null;
  result?: Record<string, unknown> | null;
  createdAt: string;
  finishedAt?: string | null;
}

export interface AutomationStatus {
  timeZone: string;
  scheduler: boolean;
  tasks: { task: MoneyTask; startsAt: string; lastJob: AutomationJob | null }[];
  rates: RateSourceStatus[];
  priceFeeds: { assetId: string; code: string; symbol: string; latest: { date: string; price: string; currency: string } | null }[];
  recurring: { active: number; nextRunAt: string | null };
}

// ---- Claude access -------------------------------------------------------------------

export type TokenScope = "read" | "draft";

export interface ApiToken {
  id: string;
  name: string;
  scope: TokenScope;
  prefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface CreatedApiToken extends ApiToken {
  /** shown once */
  token: string;
}
