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
  asset?: { ticker: string; currency: string; name?: string };
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
