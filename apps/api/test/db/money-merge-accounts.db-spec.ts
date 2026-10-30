import type { TestingModule } from '@nestjs/testing';
import type { PrismaService } from '@platform/db/prisma.service';
import { AccountsService } from '@tools/money/accounts/accounts.service';
import { AssetsService } from '@tools/money/investments/assets.service';
import { MovementsService } from '@tools/money/movements/movements.service';
import { moneyHarness } from './money-harness';

/**
 * Merging accounts: mBank USD becomes the USD of mBank. Its currency moves over
 * with every entry; no posted transaction changes, the balances stay to the cent.
 */
describe('merging accounts', () => {
  let app: TestingModule;
  let prisma: PrismaService;
  let accounts: AccountsService;
  let movements: MovementsService;
  let userId: string;
  let pln: string;
  let usd: string;

  const on = '2026-01-01';
  const post = (kind: Parameters<MovementsService['post']>[1]['kind'], input: Record<string, unknown>) =>
    movements.post(userId, { kind, input }, { actor: 'user' });

  beforeAll(async () => {
    const h = await moneyHarness();
    app = h.app;
    prisma = h.prisma;
    userId = await h.newUser('merge');
    accounts = app.get(AccountsService);
    movements = app.get(MovementsService);
    pln = (await accounts.create(userId, { name: 'mBank PLN', type: 'bank', currencies: ['PLN'], openingBalances: [{ currency: 'PLN', amount: '1000.00', date: on }] })).id;
    usd = (await accounts.create(userId, { name: 'mBank USD', type: 'bank', currencies: ['USD'], numbers: [{ currency: 'USD', number: 'PL27 1140' }], openingBalances: [{ currency: 'USD', amount: '50.00', date: on }] })).id;
    await post('transfer', { date: '2026-01-05', fromAccountId: pln, fromCurrency: 'PLN', amountOut: '400.00', toAccountId: usd, toCurrency: 'USD', amountIn: '100.00' });
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } });
    await app.close();
  });

  it('moves the currencies with their history and drops the emptied account', async () => {
    const entriesBefore = await prisma.moneyEntry.findMany({ where: { transaction: { userId } }, orderBy: { id: 'asc' } });
    const merged = await accounts.merge(userId, usd, pln, { name: 'mBank' });
    expect(merged.name).toBe('mBank');
    expect(merged.balances.map((b) => [b.commodityId, b.balance?.value, b.number])).toEqual([
      ['PLN', '600.00', null],
      ['USD', '150.00', 'PL27 1140'],
    ]);
    await expect(accounts.get(userId, usd)).rejects.toThrow(/not found/);
    // the ledger itself is untouched
    const entriesAfter = await prisma.moneyEntry.findMany({ where: { transaction: { userId } }, orderBy: { id: 'asc' } });
    expect(entriesAfter).toEqual(entriesBefore);
  });

  it('refuses two accounts holding the same currency, different types, or units', async () => {
    const other = (await accounts.create(userId, { name: 'Cash PLN', type: 'bank', currencies: ['PLN'] })).id;
    await expect(accounts.merge(userId, other, pln, {})).rejects.toThrow(/both hold PLN/);
    const debt = (await accounts.create(userId, { name: 'Loan', type: 'debt', currencies: ['EUR'] })).id;
    await expect(accounts.merge(userId, debt, pln, {})).rejects.toThrow(/same type/);
    const ibkr = (await accounts.create(userId, { name: 'IBKR', type: 'investment', currencies: ['EUR'], openingBalances: [{ currency: 'EUR', amount: '500.00', date: on }] })).id;
    const xtb = (await accounts.create(userId, { name: 'XTB', type: 'investment', currencies: ['PLN'] })).id;
    const vwce = (await app.get(AssetsService).create(userId, { code: 'VWCE', name: 'VWCE', quoteCurrency: 'EUR' })).id;
    await post('buy', { date: '2026-02-02', accountId: ibkr, assetId: vwce, units: '1', total: '100.00', currency: 'EUR' });
    await expect(accounts.merge(userId, ibkr, xtb, {})).rejects.toThrow(/units/);
    await expect(accounts.merge(userId, pln, pln, {})).rejects.toThrow(/itself/);
  });
});
