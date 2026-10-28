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
