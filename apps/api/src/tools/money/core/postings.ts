import { assertBalanced, type LedgerLine } from './ledger';

/**
 * Every movement as ledger lines (rule 2). Pure: amounts arrive already parsed
 * (minor units, units scaled by 10^10), accounts as ids or system roles; the
 * ledger service resolves sub-accounts and writes. Each builder returns lines
 * that sum to zero per commodity, which `balanced` checks before returning.
 */

export type SystemRole = 'income' | 'expense' | 'opening_balance' | 'conversion';
export type AccountRef = { accountId: string } | { system: SystemRole };

export interface PostingLine {
  account: AccountRef;
  commodityId: string;
  /** currency sub-accounts: minor units, positive = into the sub-account */
  amountMinor?: bigint;
  /** asset sub-accounts: units scaled by 10^10 */
  quantity?: bigint;
  /** income and expense lines */
  categoryId?: string | null;
}

export class PostingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PostingError';
  }
}

const own = (accountId: string): AccountRef => ({ accountId });
const system = (role: SystemRole): AccountRef => ({ system: role });

export function refKey(ref: AccountRef): string {
  return 'accountId' in ref ? ref.accountId : `system:${ref.system}`;
}

function positive(value: bigint, what: string): void {
  if (value <= 0n) throw new PostingError(`${what} must be more than zero`);
}

function balanced(lines: PostingLine[]): PostingLine[] {
  const nonZero = lines.filter((l) => (l.amountMinor ?? l.quantity) !== 0n);
  assertBalanced(
    nonZero.map(
      (l): LedgerLine => ({
        subAccountId: `${refKey(l.account)}/${l.commodityId}`,
        commodityId: l.commodityId,
        amountMinor: l.amountMinor,
        quantity: l.quantity,
      }),
    ),
  );
  return nonZero;
}

// ---- cash movements -------------------------------------------------------------------

export interface CashParams {
  accountId: string;
  currency: string;
  amount: bigint;
  categoryId?: string | null;
}

export function incomeLines(p: CashParams): PostingLine[] {
  positive(p.amount, 'amount');
  return balanced([
    { account: own(p.accountId), commodityId: p.currency, amountMinor: p.amount },
    { account: system('income'), commodityId: p.currency, amountMinor: -p.amount, categoryId: p.categoryId },
  ]);
}

/** An expense, or a fee (same lines, the fees category). */
export function expenseLines(p: CashParams): PostingLine[] {
  positive(p.amount, 'amount');
  return balanced([
    { account: own(p.accountId), commodityId: p.currency, amountMinor: -p.amount },
    { account: system('expense'), commodityId: p.currency, amountMinor: p.amount, categoryId: p.categoryId },
  ]);
}

/** What the account held when tracking started; negative for a debt. */
export function openingBalanceLines(p: { accountId: string; currency: string; amount: bigint }): PostingLine[] {
  if (p.amount === 0n) throw new PostingError('an opening balance of zero needs no transaction');
  return balanced([
    { account: own(p.accountId), commodityId: p.currency, amountMinor: p.amount },
    { account: system('opening_balance'), commodityId: p.currency, amountMinor: -p.amount },
  ]);
}

export interface TransferParams {
  from: { accountId: string; currency: string; amount: bigint };
  /** amount: what arrived; required across currencies, implied (sent - fee) within one */
  to: { accountId: string; currency: string; amount?: bigint };
  /** charged on the sending side, in its currency, and part of from.amount */
  fee?: bigint;
  feeCategoryId?: string | null;
}

export interface TransferPlan {
  lines: PostingLine[];
  /** what left the sending side net of the fee */
  converted: bigint;
  received: bigint;
  crossCurrency: boolean;
}

/**
 * Between two sub-accounts. Same currency: one amount (less an optional fee).
 * Across currencies the money passes through the conversion account, one leg
 * per currency, so each currency still sums to zero; the fee is an expense.
 */
export function transferLines(p: TransferParams): TransferPlan {
  const fee = p.fee ?? 0n;
  positive(p.from.amount, 'the amount sent');
  if (fee < 0n) throw new PostingError('the fee cannot be negative');
  if (fee >= p.from.amount) throw new PostingError('the fee must be less than the amount sent');
  const converted = p.from.amount - fee;
  const feeLine: PostingLine[] =
    fee > 0n
      ? [{ account: system('expense'), commodityId: p.from.currency, amountMinor: fee, categoryId: p.feeCategoryId }]
      : [];

  if (p.from.currency === p.to.currency) {
    if (p.from.accountId === p.to.accountId) throw new PostingError('a transfer needs two different sub-accounts');
    if (p.to.amount !== undefined && p.to.amount !== converted) {
      throw new PostingError(
        `the amount received (${p.to.amount}) differs from the amount sent less the fee (${converted}); record the difference as the fee`,
      );
    }
    return {
      lines: balanced([
        { account: own(p.from.accountId), commodityId: p.from.currency, amountMinor: -p.from.amount },
        ...feeLine,
        { account: own(p.to.accountId), commodityId: p.to.currency, amountMinor: converted },
      ]),
      converted,
      received: converted,
      crossCurrency: false,
    };
  }

  if (p.to.amount === undefined) throw new PostingError('a transfer across currencies needs the amount received');
  positive(p.to.amount, 'the amount received');
  return {
    lines: balanced([
      { account: own(p.from.accountId), commodityId: p.from.currency, amountMinor: -p.from.amount },
      ...feeLine,
      { account: system('conversion'), commodityId: p.from.currency, amountMinor: converted },
      { account: system('conversion'), commodityId: p.to.currency, amountMinor: -p.to.amount },
      { account: own(p.to.accountId), commodityId: p.to.currency, amountMinor: p.to.amount },
    ]),
    converted,
    received: p.to.amount,
    crossCurrency: true,
  };
}

// ---- investments ----------------------------------------------------------------------

export interface BuyParams {
  accountId: string;
  assetId: string;
  units: bigint;
  /** the sub-account the money came from (usually the same account) */
  paidFrom: { accountId: string; currency: string };
  /** all-in: price times units plus every fee, in the currency paid */
  total: bigint;
}

/** Cash out, units in; each side balances through the conversion account (a transfer at cost). */
export function buyLines(p: BuyParams): PostingLine[] {
  positive(p.units, 'units');
  if (p.total < 0n) throw new PostingError('the amount paid cannot be negative');
  return balanced([
    { account: own(p.paidFrom.accountId), commodityId: p.paidFrom.currency, amountMinor: -p.total },
    { account: system('conversion'), commodityId: p.paidFrom.currency, amountMinor: p.total },
    { account: system('conversion'), commodityId: p.assetId, quantity: -p.units },
    { account: own(p.accountId), commodityId: p.assetId, quantity: p.units },
  ]);
}

export interface SellParams {
  accountId: string;
  assetId: string;
  units: bigint;
  /** where the proceeds went (usually the same account) */
  proceedsTo: { accountId: string; currency: string };
  /** net of every fee, in the currency received */
  proceeds: bigint;
}

export function sellLines(p: SellParams): PostingLine[] {
  positive(p.units, 'units');
  if (p.proceeds < 0n) throw new PostingError('the proceeds cannot be negative');
  return balanced([
    { account: own(p.accountId), commodityId: p.assetId, quantity: -p.units },
    { account: system('conversion'), commodityId: p.assetId, quantity: p.units },
    { account: system('conversion'), commodityId: p.proceedsTo.currency, amountMinor: -p.proceeds },
    { account: own(p.proceedsTo.accountId), commodityId: p.proceedsTo.currency, amountMinor: p.proceeds },
  ]);
}

export interface InvestmentIncomeParams {
  accountId: string;
  currency: string;
  /** what arrived in the account */
  net: bigint;
  /** tax withheld at source, already deducted from the gross amount */
  withholding?: bigint;
  incomeCategoryId?: string | null;
  taxCategoryId?: string | null;
}

/** A dividend or interest: the gross amount is income, the tax withheld an expense. */
export function investmentIncomeLines(p: InvestmentIncomeParams): PostingLine[] {
  const withholding = p.withholding ?? 0n;
  positive(p.net, 'the amount received');
  if (withholding < 0n) throw new PostingError('the tax withheld cannot be negative');
  return balanced([
    { account: own(p.accountId), commodityId: p.currency, amountMinor: p.net },
    ...(withholding > 0n
      ? [{ account: system('expense'), commodityId: p.currency, amountMinor: withholding, categoryId: p.taxCategoryId }]
      : []),
    {
      account: system('income'),
      commodityId: p.currency,
      amountMinor: -(p.net + withholding),
      categoryId: p.incomeCategoryId,
    },
  ]);
}

export function unitMoveLines(p: {
  fromAccountId: string;
  toAccountId: string;
  assetId: string;
  units: bigint;
}): PostingLine[] {
  positive(p.units, 'units');
  if (p.fromAccountId === p.toAccountId) throw new PostingError('units move between two different accounts');
  return balanced([
    { account: own(p.fromAccountId), commodityId: p.assetId, quantity: -p.units },
    { account: own(p.toAccountId), commodityId: p.assetId, quantity: p.units },
  ]);
}

/** A split changes the number of units held; the difference comes from the conversion account. */
export function splitLines(assetId: string, deltas: readonly { accountId: string; delta: bigint }[]): PostingLine[] {
  const lines: PostingLine[] = [];
  for (const { accountId, delta } of deltas) {
    if (delta === 0n) continue;
    lines.push({ account: own(accountId), commodityId: assetId, quantity: delta });
    lines.push({ account: system('conversion'), commodityId: assetId, quantity: -delta });
  }
  if (lines.length === 0) throw new PostingError('the split changes no holding');
  return balanced(lines);
}

/** The mirror image of posted lines: a reversal leaves every balance as it was before. */
export function reversalLines(lines: readonly PostingLine[]): PostingLine[] {
  return balanced(
    lines.map((l) => ({
      ...l,
      amountMinor: l.amountMinor === undefined ? undefined : -l.amountMinor,
      quantity: l.quantity === undefined ? undefined : -l.quantity,
    })),
  );
}
