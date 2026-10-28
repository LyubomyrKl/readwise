import { detectDateFormat, fingerprint, parseAmountCell, parseDateCell, withOrdinals } from './import-parse';

/**
 * Bank statement exports of one account (mBank, PKO BP, ZEN): money in is
 * income, money out an expense, and a payment to or from another of your own
 * accounts (recognised by its number) a transfer. Each bank writes its own
 * header; a preset names the columns it may use.
 */

export type BankField = 'date' | 'amount' | 'currency' | 'description' | 'title' | 'counterparty' | 'counterpartyAccount' | 'category' | 'balance' | 'type';

export interface BankPreset {
  id: string;
  label: string;
  /** header names per field, lowercase, without "#" */
  columns: Partial<Record<BankField, string[]>>;
  /** unnamed columns after the description belong to it (PKO) */
  descriptionContinues?: boolean;
}

export interface BankProposal {
  kind: 'income' | 'expense' | 'transfer';
  input: Record<string, string>;
  category?: { name: string; kind: 'income' | 'expense' };
}

export interface BankRow {
  rowNumber: number;
  status: 'ready' | 'error';
  message?: string;
  proposal?: BankProposal;
  dedupeHash?: string;
}

export interface BankInput {
  rows: readonly string[][];
  account: { id: string; currencies: string[] };
  /** your other accounts, to recognise transfers between them */
  ownAccounts: readonly { id: string; number: string | null }[];
}

export const MBANK: BankPreset = {
  id: 'mbank',
  label: 'mBank statement (CSV)',
  columns: {
    date: ['data operacji'],
    description: ['opis operacji'],
    title: ['tytuł', 'tytul'],
    counterparty: ['nadawca/odbiorca'],
    counterpartyAccount: ['numer konta'],
    category: ['kategoria'],
    amount: ['kwota'],
    balance: ['saldo po operacji'],
  },
};

export const PKO: BankPreset = {
  id: 'pko',
  label: 'PKO BP statement (CSV)',
  columns: {
    date: ['data operacji'],
    type: ['typ transakcji'],
    amount: ['kwota'],
    currency: ['waluta'],
    balance: ['saldo po transakcji'],
    description: ['opis transakcji'],
  },
  descriptionContinues: true,
};

export const ZEN: BankPreset = {
  id: 'zen',
  label: 'ZEN statement (CSV)',
  columns: {
    date: ['date', 'data', 'transaction date', 'data transakcji', 'created at', 'booking date'],
    description: ['description', 'opis', 'title', 'tytuł', 'merchant', 'details'],
    counterparty: ['counterparty', 'recipient', 'odbiorca', 'kontrahent'],
    category: ['category', 'kategoria'],
    amount: ['amount', 'kwota', 'value', 'wartość'],
    currency: ['currency', 'waluta'],
    balance: ['balance', 'saldo', 'balance after'],
  },
};

const normalize = (cell: string) => cell.replace(/^\uFEFF/, '').replace(/^#/, '').trim().toLowerCase();
const digits = (value: string | null | undefined) => (value ?? '').replace(/\D/g, '');

function headerColumns(row: readonly string[], preset: BankPreset): Partial<Record<BankField, number>> | null {
  const cells = row.map(normalize);
  const out: Partial<Record<BankField, number>> = {};
  for (const [field, names] of Object.entries(preset.columns) as [BankField, string[]][]) {
    const i = cells.findIndex((c) => names.includes(c));
    if (i >= 0) out[field] = i;
  }
  return out.date !== undefined && out.amount !== undefined ? out : null;
}

/** "Rachunek odbiorcy: 12 3456 …" or a plain number column: the counterparty's account number. */
function accountNumberIn(text: string): string | null {
  const m = /(?:rachunek|konto|account|iban)[^:]*:\s*([A-Z]{2})?\s*([\d ]{20,40})/i.exec(text);
  return m ? digits(m[2]) : null;
}

function same(a: string, b: string): boolean {
  // a Polish IBAN without "PL" is 26 digits; compare the last 26 so "PL61 1090…" and "61 1090…" agree
  return a.length >= 10 && b.length >= 10 && a.slice(-26) === b.slice(-26);
}

export function mapBankStatement(preset: BankPreset, { rows, account, ownAccounts }: BankInput): BankRow[] {
  const headerIndex = rows.findIndex((r, i) => i < 80 && headerColumns(r, preset) !== null);
  if (headerIndex < 0) return [];
  const cols = headerColumns(rows[headerIndex], preset)!;
  const header = rows[headerIndex].map(normalize);
  const data = rows.slice(headerIndex + 1).map((cells, i) => ({ cells, rowNumber: headerIndex + i + 2 }));
  const cell = (cells: readonly string[], field: BankField) => {
    const i = cols[field];
    return i === undefined ? '' : (cells[i] ?? '').trim();
  };
  const format = detectDateFormat(data.map((d) => cell(d.cells, 'date')).filter(Boolean).slice(0, 200));
  const fallbackCurrency = account.currencies.length === 1 ? account.currencies[0] : (account.currencies[0] ?? 'PLN');

  const keyed: { row: BankRow; key: string }[] = [];
  const out: BankRow[] = [];
  for (const { cells, rowNumber } of data) {
    const rawDate = cell(cells, 'date');
    const rawAmount = cell(cells, 'amount');
    if (!rawDate && !rawAmount) continue;
    const date = format ? parseDateCell(rawDate, format) : null;
    const amount = parseAmountCell(rawAmount);
    if (!date || !amount) continue; // summary and footer lines
    if (!/[1-9]/.test(amount)) continue;

    const currency = (cell(cells, 'currency') || /\b([A-Z]{3})\b/.exec(rawAmount)?.[1] || fallbackCurrency).toUpperCase();
    let description = [cell(cells, 'type'), cell(cells, 'description'), cell(cells, 'title'), cell(cells, 'counterparty')]
      .filter(Boolean)
      .join(' · ');
    if (preset.descriptionContinues && cols.description !== undefined) {
      const extra = cells.slice(cols.description + 1).filter((c, j) => !header[cols.description! + 1 + j] && c.trim());
      if (extra.length) description = [description, ...extra.map((c) => c.trim())].join(' · ');
    }
    description = description.replace(/\s+/g, ' ').trim().slice(0, 500);
    const counterNumber = digits(cell(cells, 'counterpartyAccount')) || accountNumberIn(description);
    const own = counterNumber ? ownAccounts.find((a) => a.id !== account.id && a.number && same(digits(a.number), counterNumber)) : undefined;

    const outgoing = amount.startsWith('-');
    const value = outgoing ? amount.slice(1) : amount;
    if (!account.currencies.includes(currency)) {
      out.push({ rowNumber, status: 'error', message: `${currency} is not held on this account; add the currency to the account first` });
      continue;
    }
    let proposal: BankProposal;
    if (own) {
      proposal = {
        kind: 'transfer',
        input: outgoing
          ? { date, fromAccountId: account.id, fromCurrency: currency, amountOut: value, toAccountId: own.id, toCurrency: currency, amountIn: value, note: description }
          : { date, fromAccountId: own.id, fromCurrency: currency, amountOut: value, toAccountId: account.id, toCurrency: currency, amountIn: value, note: description },
      };
    } else {
      const categoryName = cell(cells, 'category');
      proposal = {
        kind: outgoing ? 'expense' : 'income',
        input: { date, accountId: account.id, currency, amount: value, note: description },
        ...(categoryName ? { category: { name: categoryName.slice(0, 60), kind: outgoing ? 'expense' : 'income' } } : {}),
      };
    }
    const row: BankRow = { rowNumber, status: 'ready', proposal };
    out.push(row);
    keyed.push({ row, key: fingerprint([preset.id, account.id, date, amount, currency, description, cell(cells, 'balance')]) });
  }
  for (const { item, ordinal } of withOrdinals(keyed, (k) => k.key)) item.row.dedupeHash = ordinal === 0 ? item.key : fingerprint([item.key], ordinal);
  return out;
}
