import type { TestingModule } from '@nestjs/testing';
import type { PrismaService } from '@platform/db/prisma.service';
import { AccountsService } from '@tools/money/accounts/accounts.service';
import { LedgerService } from '@tools/money/ledger/ledger.service';
import { MovementsService } from '@tools/money/movements/movements.service';
import { ViewsService } from '@tools/money/views/views.service';
import { moneyHarness } from './money-harness';

/**
 * Accounts without a group, an account number per currency, an expense with a
 * fee on top, and dividends only into investment or bonds accounts.
 */
describe('accounts and fees', () => {
  let app: TestingModule;
  let prisma: PrismaService;
  let accounts: AccountsService;
  let movements: MovementsService;
  let userId: string;
  let mbank: string;

  const balance = async (id: string, currency: string) => (await accounts.get(userId, id)).balances.find((b) => b.commodityId === currency)!;

  beforeAll(async () => {
    const h = await moneyHarness();
    app = h.app;
    prisma = h.prisma;
    userId = await h.newUser('accfees');
    accounts = app.get(AccountsService);
    movements = app.get(MovementsService);
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } });
    await app.close();
  });

  it('creates an account without a group, with a number per currency', async () => {
    const created = await accounts.create(userId, {
      name: 'mBank',
      type: 'bank',
      currencies: ['PLN', 'USD'],
      numbers: [{ currency: 'PLN', number: ' PL61 1090 1014 0000 0712 1981 2874 ' }],
      openingBalances: [{ currency: 'PLN', amount: '1000.00', date: '2026-01-01' }],
    });
    mbank = created.id;
    expect(created.institution).toBeNull();
    expect(created.balances.map((b) => [b.commodityId, b.number])).toEqual([
      ['PLN', 'PL61 1090 1014 0000 0712 1981 2874'],
      ['USD', null],
    ]);
    await expect(accounts.create(userId, { name: 'x', type: 'bank', currencies: ['PLN'], numbers: [{ currency: 'EUR', number: '1' }] })).rejects.toThrow(/EUR/);
  });

  it('sets and clears the number of one currency', async () => {
    const set = await accounts.setNumber(userId, mbank, 'usd', 'PL27 1140 2004 0000 3102 7654 3210');
    expect(set.balances.find((b) => b.commodityId === 'USD')!.number).toBe('PL27 1140 2004 0000 3102 7654 3210');
    const cleared = await accounts.setNumber(userId, mbank, 'PLN', '  ');
    expect(cleared.balances.find((b) => b.commodityId === 'PLN')!.number).toBeNull();
    await expect(accounts.setNumber(userId, mbank, 'EUR', '1')).rejects.toThrow(/no EUR sub-account/);
  });

  it('books an expense with a fee on top: the account pays both, the fee lands in Fees', async () => {
    const tx = await movements.post(
      userId,
      { kind: 'expense', input: { date: '2026-02-01', accountId: mbank, currency: 'PLN', amount: '100.00', fee: '4.50' } },
      { actor: 'user' },
    );
    expect((await balance(mbank, 'PLN')).balance!.value).toBe('895.50');
    const fees = await app.get(LedgerService).categoryByKey(prisma, userId, 'fees');
    const entries = await prisma.moneyEntry.findMany({ where: { transactionId: tx.id, categoryId: fees } });
    expect(entries.map((e) => e.amountMinor)).toEqual([450n]);
  });

  it('sums a whole period by category, not just one month', async () => {
    await movements.post(userId, { kind: 'expense', input: { date: '2026-03-10', accountId: mbank, currency: 'PLN', amount: '50.00' } }, { actor: 'user' });
    await movements.post(userId, { kind: 'income', input: { date: '2026-03-11', accountId: mbank, currency: 'PLN', amount: '300.00' } }, { actor: 'user' });
    const p = await app.get(ViewsService).period(userId, { from: '2026-02', to: '2026-03', base: 'PLN' });
    expect([p.from, p.to, p.expenses.value, p.income.value]).toEqual(['2026-02', '2026-03', '154.50', '300.00']);
    expect(p.expensesByCategory.map((c) => [c.name, c.value.value])).toEqual([
      ['Other expenses', '150.00'],
      ['Fees', '4.50'],
    ]);
    const march = await app.get(ViewsService).period(userId, { from: '2026-03', to: '2026-03', base: 'PLN' });
    expect(march.expenses.value).toBe('50.00');
  });

  it('refuses a dividend into a bank account', async () => {
    await expect(
      movements.post(userId, { kind: 'investment_income', input: { date: '2026-02-02', accountId: mbank, currency: 'PLN', amount: '10.00' } }, { actor: 'user' }),
    ).rejects.toThrow(/investment or bonds account/);
  });
});
