import { readFileSync } from 'fs';
import { join } from 'path';
import { parseCsv } from './csv';
import { mapIbkrStatement, securityOf } from './ibkr';

const fixture = (name: string) => readFileSync(join(__dirname, '../../../../test/fixtures/money', name), 'utf8');
const decimalsOf = (c: string) => (['EUR', 'USD', 'PLN'].includes(c) ? 2 : undefined);

describe('IBKR activity statement', () => {
  const rows = mapIbkrStatement({ rows: parseCsv(fixture('ibkr-2027-07.csv')), accountId: 'ibkr', decimalsOf });
  const ready = rows.filter((r) => r.status === 'ready');

  it('turns trades into buys at the all-in cost', () => {
    const buys = ready.filter((r) => r.proposal?.kind === 'buy').map((r) => r.proposal!);
    expect(buys.map((b) => [b.input.date, b.input.units, b.input.total, b.input.currency])).toEqual([
      ['2027-07-05', '10', '1206.25', 'EUR'],
      ['2027-07-19', '5', '606.75', 'EUR'],
    ]);
    expect(buys[0].asset).toEqual({ ticker: 'VWCE', currency: 'EUR', name: 'VANGUARD FTSE ALL-WORLD U.ETF', isin: 'IE00BK5BQT80' });
  });

  it('turns a currency trade into a conversion inside the account', () => {
    const fx = ready.find((r) => r.proposal?.kind === 'transfer')!.proposal!;
    // sold 100 EUR for 112 USD; the 2 EUR commission came off the euros as well
    expect(fx.input).toMatchObject({ fromAccountId: 'ibkr', toAccountId: 'ibkr', fromCurrency: 'EUR', amountOut: '102.00', toCurrency: 'USD', amountIn: '112.00' });
  });

  it('puts the tax withheld beside its dividend, and keeps a later adjustment apart', () => {
    const dividend = ready.find((r) => r.proposal?.kind === 'investment_income' && r.proposal.input.incomeType === 'dividend')!.proposal!;
    // 12.30 gross, 1.85 withheld: 10.45 arrived
    expect(dividend.input).toMatchObject({ date: '2027-07-15', currency: 'USD', amount: '10.45', withholding: '1.85' });
    expect(dividend.asset).toMatchObject({ ticker: 'VT', isin: 'US9220427424' });
    const adjustment = ready.find((r) => r.proposal?.kind === 'expense')!.proposal!;
    expect(adjustment).toMatchObject({ input: { date: '2027-07-20', amount: '0.10' }, category: { name: 'Taxes' } });
  });

  it('imports interest and fees, and only compares deposits with the ledger', () => {
    expect(ready.find((r) => r.proposal?.input.incomeType === 'interest')?.proposal?.input.amount).toBe('0.42');
    expect(ready.find((r) => r.proposal?.kind === 'fee')?.proposal?.input).toMatchObject({ currency: 'USD', amount: '1.50' });
    const deposit = rows.find((r) => r.proposal?.matchOnly)!;
    expect(deposit.status).toBe('skipped');
    expect(deposit.proposal!.input).toMatchObject({ toAccountId: 'ibkr', amountIn: '2000.00' });
  });

  it('fingerprints every movement so a second statement over the same days is recognised', () => {
    const hashes = ready.map((r) => r.dedupeHash);
    expect(hashes.every(Boolean)).toBe(true);
    expect(new Set(hashes).size).toBe(hashes.length);
    const again = mapIbkrStatement({ rows: parseCsv(fixture('ibkr-2027-07.csv')), accountId: 'ibkr', decimalsOf });
    expect(again.filter((r) => r.status === 'ready').map((r) => r.dedupeHash)).toEqual(hashes);
    expect(ready).toHaveLength(7);
  });

  it('reads the security of a dividend line', () => {
    expect(securityOf('VWCE(IE00BK5BQT80) Cash Dividend EUR 0.39 per Share (Ordinary Dividend)')).toEqual({ symbol: 'VWCE', isin: 'IE00BK5BQT80' });
    expect(securityOf('no security here')).toBeNull();
  });
});
