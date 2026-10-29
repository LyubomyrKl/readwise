import { addDecimals, divRound, formatScaled, parseScaled } from './decimal';
import { fingerprint, parseAmountCell, withOrdinals } from './import-parse';

/**
 * An Interactive Brokers activity statement (CSV) as movements of one account.
 * Every line starts with its section and "Header" or "Data"; a Header line
 * names the fields of the Data lines after it. Pure: assets stay tickers and
 * categories names until the import service resolves them.
 *
 *  Trades (stocks, ETFs, bonds)  buy or sell; the commission is part of the cost or comes off the proceeds
 *  Trades (forex)                a conversion between the account's currencies; the commission comes off what was received
 *                                (one in a third currency is left for the user to record as a fee)
 *  Dividends + Withholding Tax   one investment income per payment: what arrived, and the tax withheld beside it
 *  Interest                      investment income (paid) or a fee (charged)
 *  Fees                          a fee
 *  Deposits & Withdrawals        the other half of a transfer recorded from the paying account: only compared with the ledger
 */

export interface BrokerProposal {
  kind: 'buy' | 'sell' | 'investment_income' | 'fee' | 'expense' | 'transfer';
  input: Record<string, string>;
  category?: { name: string; kind: 'income' | 'expense' };
  asset?: { ticker: string; currency: string; name?: string; isin?: string };
  /** never posted from the import; shown as matched when the ledger already has it */
  matchOnly?: boolean;
}

export interface BrokerRow {
  rowNumber: number;
  status: 'ready' | 'skipped' | 'error';
  message?: string;
  proposal?: BrokerProposal;
  dedupeHash?: string;
}

interface Line {
  rowNumber: number;
  section: string;
  fields: Record<string, string>;
}

const scaleOf = (v: string) => (v.split('.')[1] ?? '').length;

function negate(v: string): string {
  return v.startsWith('-') ? v.slice(1) : `-${v}`;
}

/** Exactly the currency's places, half up; brokers sometimes print fractions of a cent. */
function toPlaces(v: string, places: number): string {
  const scale = scaleOf(v);
  const scaled = parseScaled(v, scale);
  const value = scale > places ? divRound(scaled, 10n ** BigInt(scale - places)) : scaled * 10n ** BigInt(places - scale);
  return formatScaled(value, places);
}

const isNegative = (v: string) => v.startsWith('-') && /[1-9]/.test(v);
const isZero = (v: string) => !/[1-9]/.test(v);

function number(value: string | undefined): string | null {
  return value === undefined ? null : parseAmountCell(value, '.');
}

function dayOf(value: string | undefined): string | null {
  const m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec((value ?? '').trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** "VWCE(IE00BK5BQT80) Cash Dividend EUR 0.39 per Share (Ordinary Dividend)" -> VWCE, IE00BK5BQT80 */
export function securityOf(description: string): { symbol: string; isin?: string } | null {
  const m = /^\s*([^\s(]+)\s*\(([^)]*)\)/.exec(description);
  if (!m) return null;
  const isin = /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(m[2]) ? m[2] : undefined;
  return { symbol: m[1], isin };
}

function lines(rows: readonly string[][]): Line[] {
  const headers = new Map<string, string[]>();
  const out: Line[] = [];
  rows.forEach((row, i) => {
    const [section, kind, ...rest] = row.map((c) => c.trim());
    if (!section || !kind) return;
    if (kind === 'Header') headers.set(section, rest);
    else if (kind === 'Data') {
      const header = headers.get(section);
      if (!header) return;
      const fields: Record<string, string> = {};
      header.forEach((name, j) => (fields[name] = rest[j] ?? ''));
      out.push({ rowNumber: i + 1, section, fields });
    }
  });
  return out;
}

export interface IbkrInput {
  rows: readonly string[][];
  accountId: string;
  /** decimal places of a currency, from the currency table */
  decimalsOf: (currency: string) => number | undefined;
}

export function mapIbkrStatement({ rows, accountId, decimalsOf }: IbkrInput): BrokerRow[] {
  const all = lines(rows);
  const instruments = new Map<string, { name?: string; isin?: string }>();
  for (const l of all.filter((x) => x.section === 'Financial Instrument Information')) {
    const symbol = l.fields['Symbol'];
    if (symbol) instruments.set(symbol, { name: l.fields['Description'] || undefined, isin: l.fields['Security ID'] || undefined });
  }
  const assetRef = (symbol: string, currency: string, isin?: string) => ({
    ticker: symbol,
    currency,
    name: instruments.get(symbol)?.name,
    isin: isin ?? instruments.get(symbol)?.isin,
  });

  const out: BrokerRow[] = [];
  const keyed: { row: BrokerRow; key: string }[] = [];
  const emit = (row: BrokerRow, key?: string) => {
    out.push(row);
    if (key && row.proposal) keyed.push({ row, key });
  };
  const places = (currency: string) => decimalsOf(currency);

  // withholding tax lines, to put beside their dividend
  const withholding = all.filter((l) => l.section === 'Withholding Tax' && dayOf(l.fields['Date']));
  const usedTax = new Set<number>();

  for (const l of all) {
    const f = l.fields;
    const currency = (f['Currency'] ?? '').toUpperCase();
    if (currency.startsWith('TOTAL') || f['Currency'] === '') {
      if (['Dividends', 'Withholding Tax', 'Interest', 'Fees', 'Deposits & Withdrawals'].includes(l.section)) continue;
    }

    switch (l.section) {
      case 'Trades': {
        if ((f['DataDiscriminator'] ?? 'Order') !== 'Order' && f['DataDiscriminator'] !== 'Trade') continue;
        const category = f['Asset Category'] ?? '';
        const date = dayOf(f['Date/Time']);
        const quantity = number(f['Quantity']);
        const proceeds = number(f['Proceeds']);
        const commission = number(f['Comm/Fee'] ?? Object.entries(f).find(([k]) => k.startsWith('Comm in'))?.[1]) ?? '0';
        const symbol = f['Symbol'] ?? '';
        if (!date || !quantity || !proceeds || isZero(quantity)) {
          emit({ rowNumber: l.rowNumber, status: 'error', message: 'a trade without date, quantity or proceeds' });
          continue;
        }
        const dp = places(currency);
        if (dp === undefined) {
          emit({ rowNumber: l.rowNumber, status: 'error', message: `unknown currency ${currency}` });
          continue;
        }
        const key = fingerprint(['ibkr', 'trade', f['Date/Time'], symbol, quantity, proceeds]);
        const note = `${symbol} ${quantity.replace(/^-/, '')} @ ${f['T. Price'] ?? ''}`.trim();

        if (category === 'Forex') {
          // EUR.USD: quantity in EUR (base), proceeds in USD (quote); the commission is in the account's base currency
          const [base, quote] = symbol.split('.');
          const commCurrency = (Object.keys(f).find((k) => k.startsWith('Comm in'))?.slice(8) ?? quote).toUpperCase();
          const buyBase = !isNegative(quantity);
          const fromCurrency = buyBase ? quote : base;
          const toCurrency = buyBase ? base : quote;
          let amountOut = buyBase ? negate(proceeds) : negate(quantity);
          let amountIn = buyBase ? quantity : proceeds;
          const paid = commission.replace(/^-/, '');
          let commissionNote = isZero(commission) ? '' : `, commission ${paid} ${commCurrency} included`;
          let message: string | undefined;
          if (!isZero(commission)) {
            if (commCurrency === toCurrency) amountIn = addDecimals(amountIn, commission);
            else if (commCurrency === fromCurrency) amountOut = addDecimals(amountOut, negate(commission));
            else {
              // one transfer cannot take it from a third currency
              commissionNote = '';
              message = `the ${paid} ${commCurrency} commission is in neither currency of ${symbol} and is not part of this conversion; record it as a fee`;
            }
          }
          const outPlaces = places(fromCurrency);
          const inPlaces = places(toCurrency);
          if (outPlaces === undefined || inPlaces === undefined) {
            emit({ rowNumber: l.rowNumber, status: 'error', message: `unknown currency in ${symbol}` });
            continue;
          }
          emit(
            {
              rowNumber: l.rowNumber,
              status: 'ready',
              ...(message ? { message } : {}),
              proposal: {
                kind: 'transfer',
                input: {
                  date,
                  fromAccountId: accountId,
                  fromCurrency,
                  amountOut: toPlaces(amountOut, outPlaces),
                  toAccountId: accountId,
                  toCurrency,
                  amountIn: toPlaces(amountIn, inPlaces),
                  note: `Conversion ${symbol}${commissionNote}`,
                },
              },
            },
            key,
          );
          continue;
        }

        if (!['Stocks', 'Bonds', 'Funds', 'ETFs'].includes(category)) {
          emit({ rowNumber: l.rowNumber, status: 'skipped', message: `${category || 'this'} trades are not imported; record them by hand` });
          continue;
        }
        if (!isNegative(quantity)) {
          // a buy: proceeds and commission are both negative
          emit(
            {
              rowNumber: l.rowNumber,
              status: 'ready',
              proposal: {
                kind: 'buy',
                input: { date, accountId, units: quantity, total: toPlaces(negate(addDecimals(proceeds, commission)), dp), currency, note },
                asset: assetRef(symbol, currency),
              },
            },
            key,
          );
        } else {
          emit(
            {
              rowNumber: l.rowNumber,
              status: 'ready',
              proposal: {
                kind: 'sell',
                input: { date, accountId, units: negate(quantity), proceeds: toPlaces(addDecimals(proceeds, commission), dp), currency, note },
                asset: assetRef(symbol, currency),
              },
            },
            key,
          );
        }
        continue;
      }

      case 'Dividends':
      case 'Payment In Lieu Of Dividends': {
        const date = dayOf(f['Date']);
        const amount = number(f['Amount']);
        const description = f['Description'] ?? '';
        const dp = places(currency);
        if (!date || !amount || dp === undefined) {
          emit({ rowNumber: l.rowNumber, status: 'error', message: 'a dividend without date, amount or a known currency' });
          continue;
        }
        const security = securityOf(description);
        const key = fingerprint(['ibkr', 'dividend', date, currency, description, amount]);
        if (isNegative(amount)) {
          emit({ rowNumber: l.rowNumber, status: 'skipped', message: 'a dividend reversal; record the correction by hand' });
          continue;
        }
        const tax = withholding.find(
          (w) =>
            !usedTax.has(w.rowNumber) &&
            dayOf(w.fields['Date']) === date &&
            (w.fields['Currency'] ?? '').toUpperCase() === currency &&
            securityOf(w.fields['Description'] ?? '')?.symbol === security?.symbol,
        );
        let withheld: string | undefined;
        if (tax) {
          const t = number(tax.fields['Amount']);
          if (t && isNegative(t)) {
            usedTax.add(tax.rowNumber);
            withheld = toPlaces(negate(t), dp);
          }
        }
        emit(
          {
            rowNumber: l.rowNumber,
            status: 'ready',
            proposal: {
              kind: 'investment_income',
              input: {
                date,
                accountId,
                currency,
                // what arrived: the gross dividend less the tax withheld
                amount: toPlaces(withheld ? addDecimals(amount, negate(withheld)) : amount, dp),
                ...(withheld ? { withholding: withheld } : {}),
                incomeType: 'dividend',
                note: description.slice(0, 200),
              },
              ...(security ? { asset: assetRef(security.symbol, currency, security.isin) } : {}),
            },
          },
          key,
        );
        continue;
      }

      case 'Withholding Tax':
        // handled with its dividend below, once every dividend has had its pick
        continue;

      case 'Interest': {
        const date = dayOf(f['Date']);
        const amount = number(f['Amount']);
        const dp = places(currency);
        if (!date || !amount || dp === undefined || isZero(amount)) continue;
        const key = fingerprint(['ibkr', 'interest', date, currency, f['Description'], amount]);
        const note = (f['Description'] ?? 'Interest').slice(0, 200);
        emit(
          {
            rowNumber: l.rowNumber,
            status: 'ready',
            proposal: isNegative(amount)
              ? { kind: 'fee', input: { date, accountId, currency, amount: toPlaces(negate(amount), dp), note } }
              : { kind: 'investment_income', input: { date, accountId, currency, amount: toPlaces(amount, dp), incomeType: 'interest', note } },
          },
          key,
        );
        continue;
      }

      case 'Fees': {
        const date = dayOf(f['Date']);
        const amount = number(f['Amount']);
        const dp = places(currency);
        if (!date || !amount || dp === undefined || isZero(amount)) continue;
        const key = fingerprint(['ibkr', 'fee', date, currency, f['Description'], amount]);
        const note = (f['Description'] || f['Subtitle'] || 'Fee').slice(0, 200);
        emit(
          {
            rowNumber: l.rowNumber,
            status: isNegative(amount) ? 'ready' : 'skipped',
            message: isNegative(amount) ? undefined : 'a fee refund; record it by hand',
            proposal: isNegative(amount) ? { kind: 'fee', input: { date, accountId, currency, amount: toPlaces(negate(amount), dp), note } } : undefined,
          },
          key,
        );
        continue;
      }

      case 'Deposits & Withdrawals': {
        const date = dayOf(f['Settle Date'] ?? f['Date']);
        const amount = number(f['Amount']);
        const dp = places(currency);
        if (!date || !amount || dp === undefined || isZero(amount)) continue;
        const value = toPlaces(amount.replace(/^-/, ''), dp);
        const deposit = !isNegative(amount);
        emit({
          rowNumber: l.rowNumber,
          status: 'skipped',
          message: deposit
            ? 'a deposit: record the transfer from the paying account (or it is matched below)'
            : 'a withdrawal: record the transfer to the receiving account (or it is matched below)',
          proposal: {
            kind: 'transfer',
            matchOnly: true,
            input: deposit
              ? { date, fromAccountId: '', fromCurrency: currency, amountOut: value, toAccountId: accountId, toCurrency: currency, amountIn: value }
              : { date, fromAccountId: accountId, fromCurrency: currency, amountOut: value, toAccountId: '', toCurrency: currency, amountIn: value },
          },
        });
        continue;
      }

      case 'Corporate Actions':
      case 'Transfers':
        emit({ rowNumber: l.rowNumber, status: 'skipped', message: `${l.section.toLowerCase()} are not imported; record them by hand (a split, a unit move)` });
        continue;
    }
  }

  // withholding without a dividend in this statement (a later adjustment): a tax expense
  for (const w of withholding) {
    if (usedTax.has(w.rowNumber)) {
      out.push({ rowNumber: w.rowNumber, status: 'skipped', message: 'withheld from the dividend on the same day (included there)' });
      continue;
    }
    const f = w.fields;
    const currency = (f['Currency'] ?? '').toUpperCase();
    const date = dayOf(f['Date']);
    const amount = number(f['Amount']);
    const dp = places(currency);
    if (!date || !amount || dp === undefined || isZero(amount)) continue;
    const key = fingerprint(['ibkr', 'withholding', date, currency, f['Description'], amount]);
    const note = (f['Description'] ?? 'Withholding tax').slice(0, 200);
    if (isNegative(amount)) {
      const row: BrokerRow = {
        rowNumber: w.rowNumber,
        status: 'ready',
        proposal: { kind: 'expense', input: { date, accountId, currency, amount: toPlaces(negate(amount), dp), note }, category: { name: 'Taxes', kind: 'expense' } },
      };
      out.push(row);
      keyed.push({ row, key });
    } else {
      out.push({ rowNumber: w.rowNumber, status: 'skipped', message: 'a tax refund; record it by hand' });
    }
  }

  // identical lines in one file stay apart
  for (const { item, ordinal } of withOrdinals(keyed, (k) => k.key)) item.row.dedupeHash = ordinal === 0 ? item.key : fingerprint([item.key], ordinal);
  return out.sort((a, b) => a.rowNumber - b.rowNumber);
}
