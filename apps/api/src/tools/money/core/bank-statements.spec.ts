import { readFileSync } from 'fs';
import { join } from 'path';
import { mapBankStatement, MBANK, PKO, ZEN } from './bank-statements';
import { parseCsv } from './csv';

const fixture = (name: string) => parseCsv(readFileSync(join(__dirname, '../../../../test/fixtures/money', name), 'utf8'));
const own = [
  { id: 'mbank', number: '11 1140 2004 0000 3502 1111 1234' },
  { id: 'zen', number: 'PL61 1090 1014 0000 0712 1981 2874' },
];

describe('bank statements', () => {
  it('reads an mBank export: income, expenses with their category, a transfer to an own account', () => {
    const rows = mapBankStatement(MBANK, { rows: fixture('mbank-2027-07.csv'), account: { id: 'mbank', currencies: ['PLN'] }, ownAccounts: own });
    expect(rows.map((r) => [r.proposal?.kind, r.proposal?.input.date, r.proposal?.input.amount ?? r.proposal?.input.amountOut, r.proposal?.category?.name])).toEqual([
      ['income', '2027-07-01', '15000.00', 'Wpływy'],
      ['expense', '2027-07-03', '3500.00', 'Mieszkanie'],
      ['transfer', '2027-07-05', '5000.00', undefined],
      ['expense', '2027-07-12', '45.99', 'Jedzenie i napoje'],
      ['expense', '2027-07-12', '45.99', 'Jedzenie i napoje'],
    ]);
    expect(rows[2].proposal!.input).toMatchObject({ fromAccountId: 'mbank', toAccountId: 'zen' });
    expect(rows[3].dedupeHash).not.toBe(rows[4].dedupeHash);
  });

  it('reads a PKO export, the description spread over several columns', () => {
    const rows = mapBankStatement(PKO, { rows: fixture('pko-2027-07.csv'), account: { id: 'pko', currencies: ['PLN'] }, ownAccounts: own });
    expect(rows.map((r) => [r.proposal?.kind, r.proposal?.input.amount])).toEqual([
      ['expense', '120.50'],
      ['income', '250.00'],
    ]);
    expect(rows[0].proposal!.input.note).toContain('ORLEN STACJA 123');
    expect(rows[1].proposal!.input.note).toContain('ANNA NOWAK');
  });

  it('reads a ZEN export in its own currency, and refuses a currency the account does not hold', () => {
    const rows = mapBankStatement(ZEN, { rows: fixture('zen-2027-07.csv'), account: { id: 'zen', currencies: ['EUR'] }, ownAccounts: own });
    expect(rows.map((r) => [r.proposal?.kind, r.proposal?.input.currency, r.proposal?.input.amount, r.proposal?.category?.name])).toEqual([
      ['expense', 'EUR', '210.00', 'Travel'],
      ['income', 'EUR', '1.25', undefined],
    ]);
    const plnOnly = mapBankStatement(ZEN, { rows: fixture('zen-2027-07.csv'), account: { id: 'zen', currencies: ['PLN'] }, ownAccounts: own });
    expect(plnOnly[0]).toMatchObject({ status: 'error' });
  });
});
