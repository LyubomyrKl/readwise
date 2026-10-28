import { divRound, formatScaled } from './decimal';

/**
 * The arithmetic of the three answers, on amounts already in the base
 * currency. Pure.
 *
 * Monthly flow, per transaction:
 *  - income: what the income account gave up (its entries are negative)
 *  - expenses: what the expense account received
 *  - invested: for a transaction between a spending account (bank, cash, debt)
 *    and an investment or bonds account, the money that left the spending side
 *    and was not an expense or income on the way: -(spending + expense legs +
 *    income legs). Money sent to an investment account is a transfer at cost,
 *    never an expense; selling and taking the money back counts negative.
 *    Income earned and kept inside an investment account is income, not a
 *    contribution.
 *  - opening balances are not flows.
 */

export type AccountKind = 'bank' | 'investment' | 'bonds' | 'debt' | 'system';
export type SystemRole = 'income' | 'expense' | 'opening_balance' | 'conversion' | null;

export interface FlowEntry {
  transactionId: string;
  kind: string;
  accountType: AccountKind;
  systemRole: SystemRole;
  /** currency entries in the base currency; asset entries: null */
  base: bigint | null;
  categoryId: string | null;
}

export interface MonthTotals {
  income: bigint;
  expenses: bigint;
  invested: bigint;
  /** income - expenses */
  savings: bigint;
  /** percent of income saved, one decimal; null without income */
  savingsRate: string | null;
  expensesByCategory: Map<string | null, bigint>;
  incomeByCategory: Map<string | null, bigint>;
}

const SPENDING: AccountKind[] = ['bank', 'debt'];
const INVESTING: AccountKind[] = ['investment', 'bonds'];

export function percentOf(part: bigint, whole: bigint, decimals = 1): string | null {
  if (whole === 0n) return null;
  const scale = 10n ** BigInt(decimals);
  return formatScaled(divRound(part * 100n * scale, whole), decimals);
}

export function monthTotals(entries: readonly FlowEntry[]): MonthTotals {
  const byTx = new Map<string, FlowEntry[]>();
  for (const e of entries) byTx.set(e.transactionId, [...(byTx.get(e.transactionId) ?? []), e]);

  let income = 0n;
  let expenses = 0n;
  let invested = 0n;
  const expensesByCategory = new Map<string | null, bigint>();
  const incomeByCategory = new Map<string | null, bigint>();

  for (const list of byTx.values()) {
    if (list[0].kind === 'opening_balance') continue;
    let spending = 0n;
    let expenseLegs = 0n;
    let incomeLegs = 0n;
    let touchesInvesting = false;
    let touchesSpending = false;
    for (const e of list) {
      if (INVESTING.includes(e.accountType)) touchesInvesting = true;
      if (SPENDING.includes(e.accountType)) touchesSpending = true;
      if (e.base === null) continue;
      if (e.systemRole === 'income') {
        incomeLegs += e.base;
        incomeByCategory.set(e.categoryId, (incomeByCategory.get(e.categoryId) ?? 0n) - e.base);
      } else if (e.systemRole === 'expense') {
        expenseLegs += e.base;
        expensesByCategory.set(e.categoryId, (expensesByCategory.get(e.categoryId) ?? 0n) + e.base);
      } else if (SPENDING.includes(e.accountType)) {
        spending += e.base;
      }
    }
    income -= incomeLegs;
    expenses += expenseLegs;
    if (touchesInvesting && touchesSpending) invested -= spending + expenseLegs + incomeLegs;
  }

  const savings = income - expenses;
  return {
    income,
    expenses,
    invested,
    savings,
    savingsRate: income > 0n ? percentOf(savings, income) : null,
    expensesByCategory,
    incomeByCategory,
  };
}

export interface AllocationRow {
  /** class id, or null for what no class claims */
  classId: string | null;
  value: bigint;
  /** percent of the total, one decimal */
  percent: string | null;
  targetPercent: string | null;
  /** percentage points above (+) or below (-) target */
  drift: string | null;
  /** base minor units above (+) or below (-) target */
  driftAmount: bigint | null;
}

/** `targets`: class id -> percent string. Rows in the order of `classIds`, unclassified last. */
export function allocationRows(
  values: ReadonlyMap<string | null, bigint>,
  classIds: readonly string[],
  targets: ReadonlyMap<string, string>,
): { total: bigint; rows: AllocationRow[] } {
  const total = [...values.values()].reduce((s, v) => s + v, 0n);
  const keys: (string | null)[] = [...classIds];
  if ((values.get(null) ?? 0n) !== 0n) keys.push(null);
  const rows = keys.map((classId) => {
    const value = values.get(classId) ?? 0n;
    const target = classId === null ? null : (targets.get(classId) ?? null);
    const actual = percentOf(value, total);
    let drift: string | null = null;
    let driftAmount: bigint | null = null;
    if (target !== null && total !== 0n) {
      // drift in hundredths of a point, then one decimal
      const [tn, td] = fraction(target);
      const targetAmount = divRound(total * tn, td * 100n);
      driftAmount = value - targetAmount;
      drift = formatScaled(divRound((value * 1000n * td - total * tn * 10n) , total * td), 1);
    }
    return { classId, value, percent: actual, targetPercent: target, drift, driftAmount };
  });
  return { total, rows };
}

function fraction(decimal: string): [bigint, bigint] {
  const [whole, frac = ''] = decimal.split('.');
  const den = 10n ** BigInt(frac.length);
  return [BigInt(whole + frac), den];
}

/** Splits a value across class shares (percent strings), exactly; the rest stays unclassified (null). */
export function splitByShares(value: bigint, shares: readonly { classId: string; percent: string }[]): Map<string | null, bigint> {
  const out = new Map<string | null, bigint>();
  if (shares.length === 0) {
    out.set(null, value);
    return out;
  }
  // weights in hundred-thousandths of a percent; the remainder to 100% is unclassified
  const weights = shares.map((s) => {
    const [n, d] = fraction(s.percent);
    return (n * 100_000n) / d;
  });
  const rest = 10_000_000n - weights.reduce((a, b) => a + b, 0n);
  const all = rest > 0n ? [...weights, rest] : weights;
  const parts = allocateExact(value, all);
  shares.forEach((s, i) => out.set(s.classId, (out.get(s.classId) ?? 0n) + parts[i]));
  if (rest > 0n) out.set(null, (out.get(null) ?? 0n) + parts[parts.length - 1]);
  return out;
}

function allocateExact(total: bigint, weights: bigint[]): bigint[] {
  const sum = weights.reduce((a, b) => a + b, 0n);
  if (sum === 0n) return weights.map(() => 0n);
  const negative = total < 0n;
  const abs = negative ? -total : total;
  const parts = weights.map((w) => (abs * w) / sum);
  let left = abs - parts.reduce((a, b) => a + b, 0n);
  const order = weights.map((w, i) => ({ i, r: (abs * w) % sum })).sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  for (const { i } of order) {
    if (left === 0n) break;
    parts[i] += 1n;
    left -= 1n;
  }
  return negative ? parts.map((p) => -p) : parts;
}
