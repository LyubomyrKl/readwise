import {
  detectDateFormat,
  fingerprint,
  parseAmountCell,
  parseDateCell,
  withOrdinals,
  type DateFormat,
  type DecimalSeparator,
} from './import-parse';

/**
 * A money-manager export as movements. The columns are mapped on the import
 * screen because every app writes them differently; this module only applies
 * the mapping. Pure: account names resolve through mapping.accounts, category
 * names are left for the service to resolve.
 */

export interface MoneyManagerColumns {
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

export interface TypeValues {
  income: string[];
  expense: string[];
  /** one row per transfer, with a target account column */
  transfer: string[];
  /** two rows per transfer: the sending half and the receiving half */
  transferOut: string[];
  transferIn: string[];
}

export interface MoneyManagerMapping {
  /** index of the header row; data starts on the next row */
  headerRow: number;
  columns: MoneyManagerColumns;
  dateFormat: DateFormat;
  decimalSeparator: DecimalSeparator;
  /** when there is no currency column */
  defaultCurrency: string;
  /** every row belongs to this account (no account column) */
  fixedAccountId?: string;
  /** 'signed': a negative amount is money out; 'type': the type column decides, amounts are taken as positive */
  amountSign: 'signed' | 'type';
  typeValues: TypeValues;
  /** account name as written in the file -> account id */
  accounts: Record<string, string>;
}

export const DEFAULT_TYPE_VALUES: TypeValues = {
  income: ['income', 'przychód', 'przychod', 'wpływ', 'wplyw', 'deposit'],
  expense: ['expense', 'expenses', 'exp.', 'exp', 'wydatek', 'koszt', 'withdrawal'],
  transfer: ['transfer', 'przelew'],
  transferOut: ['transfer-out', 'transfer out', 'outgoing transfer'],
  transferIn: ['transfer-in', 'transfer in', 'incoming transfer'],
};

export interface CategoryRef {
  name: string;
  parent?: string;
  kind: 'income' | 'expense';
}

/** What a row becomes; `input` is the body the movement endpoint for `kind` accepts, categories still by name. */
export interface Proposal {
  kind: 'income' | 'expense' | 'transfer';
  input: Record<string, string>;
  category?: CategoryRef;
}

export interface MappedRow {
  rowNumber: number;
  status: 'ready' | 'skipped' | 'error';
  message?: string;
  proposal?: Proposal;
  dedupeHash?: string;
  /** names found in the file, for the account mapping step */
  accountNames: string[];
}

type Direction = 'income' | 'expense' | 'transfer' | 'out' | 'in';

interface Half {
  rowNumber: number;
  index: number;
  date: string;
  accountId: string;
  accountName: string;
  currency: string;
  amount: string;
  note?: string;
  direction: 'out' | 'in';
}

const cell = (row: string[], index: number | undefined): string => (index === undefined ? '' : (row[index] ?? '').trim());
const abs = (v: string) => v.replace(/^-/, '');

function matchType(value: string, values: TypeValues): Direction | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (values.transferOut.some((t) => t.toLowerCase() === v)) return 'out';
  if (values.transferIn.some((t) => t.toLowerCase() === v)) return 'in';
  if (values.transfer.some((t) => t.toLowerCase() === v)) return 'transfer';
  if (values.income.some((t) => t.toLowerCase() === v)) return 'income';
  if (values.expense.some((t) => t.toLowerCase() === v)) return 'expense';
  return null;
}

/** Distinct values of a column below the header (account names, type values), for the mapping screen. */
export function distinctValues(rows: string[][], headerRow: number, columns: (number | undefined)[]): string[] {
  const out = new Set<string>();
  for (const row of rows.slice(headerRow + 1)) {
    for (const c of columns) {
      const v = cell(row, c);
      if (v) out.add(v);
    }
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

export function mapMoneyManagerRows(rows: string[][], mapping: MoneyManagerMapping): MappedRow[] {
  const { columns } = mapping;
  const data = rows.slice(mapping.headerRow + 1).map((row, i) => ({ row, rowNumber: mapping.headerRow + 2 + i }));
  const format =
    mapping.dateFormat === 'auto' ? detectDateFormat(data.map((d) => cell(d.row, columns.date)).filter(Boolean)) : mapping.dateFormat;

  const results: MappedRow[] = [];
  const halves: Half[] = [];

  for (const { row, rowNumber } of data) {
    const accountName = cell(row, columns.account);
    const toAccountName = cell(row, columns.toAccount);
    const names = [accountName, toAccountName].filter(Boolean);
    const result: MappedRow = { rowNumber, status: 'error', accountNames: names };
    results.push(result);
    const fail = (message: string) => {
      result.status = 'error';
      result.message = message;
    };

    const date = format ? parseDateCell(cell(row, columns.date), format) : null;
    if (!date) {
      fail(`no date in "${cell(row, columns.date)}"`);
      continue;
    }
    const amount = parseAmountCell(cell(row, columns.amount), mapping.decimalSeparator);
    if (amount === null) {
      fail(`no amount in "${cell(row, columns.amount)}"`);
      continue;
    }
    if (!/[1-9]/.test(amount)) {
      result.status = 'skipped';
      result.message = 'zero amount';
      continue;
    }
    const currency = (cell(row, columns.currency) || mapping.defaultCurrency).toUpperCase();
    const accountId = mapping.fixedAccountId ?? mapping.accounts[accountName];
    if (!accountId) {
      fail(accountName ? `map the account "${accountName}"` : 'no account');
      continue;
    }

    let direction: Direction | null = columns.type !== undefined ? matchType(cell(row, columns.type), mapping.typeValues) : null;
    if (direction === null) {
      if (mapping.amountSign === 'type' && columns.type !== undefined) {
        fail(`unknown type "${cell(row, columns.type)}"; add it to the type values`);
        continue;
      }
      // no type: a target account makes it a transfer, otherwise the sign decides
      direction = toAccountName ? 'transfer' : amount.startsWith('-') ? 'expense' : 'income';
    }
    if (direction === 'transfer' && !toAccountName) direction = amount.startsWith('-') ? 'out' : 'in';

    const notes = (columns.note ?? []).map((c) => cell(row, c)).filter(Boolean);
    const note = notes.join(' · ') || undefined;
    const categoryName = cell(row, columns.category);
    const subcategoryName = cell(row, columns.subcategory);

    if (direction === 'out' || direction === 'in') {
      halves.push({ rowNumber, index: results.length - 1, date, accountId, accountName, currency, amount: abs(amount), note, direction });
      result.status = 'skipped';
      result.message = 'waiting for the other half of the transfer';
      continue;
    }

    if (direction === 'transfer') {
      const toAccountId = mapping.accounts[toAccountName];
      if (!toAccountId) {
        fail(`map the account "${toAccountName}"`);
        continue;
      }
      const toCurrency = (cell(row, columns.toCurrency) || currency).toUpperCase();
      const toAmountCell = cell(row, columns.toAmount);
      const toAmount = toAmountCell ? parseAmountCell(toAmountCell, mapping.decimalSeparator) : null;
      const input: Record<string, string> = {
        date,
        fromAccountId: accountId,
        fromCurrency: currency,
        amountOut: abs(amount),
        toAccountId,
        toCurrency,
      };
      if (toCurrency !== currency) {
        if (!toAmount) {
          fail('a transfer across currencies needs the amount received');
          continue;
        }
        input.amountIn = abs(toAmount);
      } else if (toAmount && abs(toAmount) !== abs(amount)) {
        const fee = subtractDecimal(abs(amount), abs(toAmount));
        if (fee === null || fee.startsWith('-')) {
          fail('more arrived than was sent');
          continue;
        }
        input.fee = fee;
      }
      if (note) input.note = note;
      result.status = 'ready';
      result.proposal = { kind: 'transfer', input };
      continue;
    }

    const kind = direction;
    const input: Record<string, string> = { date, accountId, currency, amount: abs(amount) };
    if (note) input.note = note;
    const category: CategoryRef | undefined = categoryName
      ? subcategoryName
        ? { name: subcategoryName, parent: categoryName, kind }
        : { name: categoryName, kind }
      : undefined;
    result.status = 'ready';
    result.proposal = { kind, input, category };
  }

  pairTransfers(halves, results);

  // fingerprints: identical movements in one file stay distinct by their ordinal
  const keyOf = (r: MappedRow) => JSON.stringify([r.proposal?.kind, r.proposal?.input, r.proposal?.category]);
  for (const { item, ordinal } of withOrdinals(
    results.filter((r) => r.status === 'ready'),
    keyOf,
  )) {
    item.dedupeHash = fingerprint(['money-manager', keyOf(item)], ordinal);
  }
  return results;
}

/** Joins the two halves of each two-row transfer: same day, other direction, another account, nearest row first. */
function pairTransfers(halves: Half[], results: MappedRow[]): void {
  const used = new Set<number>();
  for (const out of halves.filter((h) => h.direction === 'out')) {
    const candidates = halves
      .filter(
        (h) =>
          h.direction === 'in' &&
          !used.has(h.rowNumber) &&
          h.date === out.date &&
          h.accountId !== out.accountId &&
          (h.currency !== out.currency || h.amount === out.amount),
      )
      .sort((a, b) => Math.abs(a.rowNumber - out.rowNumber) - Math.abs(b.rowNumber - out.rowNumber));
    const into = candidates[0];
    if (!into) continue;
    used.add(into.rowNumber);
    used.add(out.rowNumber);
    const input: Record<string, string> = {
      date: out.date,
      fromAccountId: out.accountId,
      fromCurrency: out.currency,
      amountOut: out.amount,
      toAccountId: into.accountId,
      toCurrency: into.currency,
    };
    if (into.currency !== out.currency) input.amountIn = into.amount;
    const note = out.note ?? into.note;
    if (note) input.note = note;
    const outRow = results[out.index];
    outRow.status = 'ready';
    outRow.message = `transfer to ${into.accountName} (row ${into.rowNumber})`;
    outRow.proposal = { kind: 'transfer', input };
    outRow.accountNames = [out.accountName, into.accountName];
    const inRow = results[into.index];
    inRow.status = 'skipped';
    inRow.message = `the receiving half of the transfer on row ${out.rowNumber}`;
  }
  for (const h of halves) {
    if (!used.has(h.rowNumber)) {
      results[h.index].status = 'error';
      results[h.index].message = `no matching ${h.direction === 'out' ? 'receiving' : 'sending'} half of this transfer on the same day`;
    }
  }
}

function subtractDecimal(a: string, b: string): string | null {
  const scale = Math.max(a.split('.')[1]?.length ?? 0, b.split('.')[1]?.length ?? 0);
  const toInt = (v: string) => BigInt(v.replace('.', '') + '0'.repeat(scale - (v.split('.')[1]?.length ?? 0)));
  const diff = toInt(a) - toInt(b);
  const negative = diff < 0n;
  const digits = (negative ? -diff : diff).toString().padStart(scale + 1, '0');
  const out = scale > 0 ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits;
  return negative ? `-${out}` : out;
}
