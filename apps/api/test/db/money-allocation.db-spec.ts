import type { TestingModule } from '@nestjs/testing';
import type { PrismaService } from '@platform/db/prisma.service';
import { AccountsService } from '@tools/money/accounts/accounts.service';
import { CategoriesService } from '@tools/money/categories/categories.service';
import { AssetsService } from '@tools/money/investments/assets.service';
import { PricesService } from '@tools/money/investments/prices.service';
import { MovementsService } from '@tools/money/movements/movements.service';
import { ViewsService } from '@tools/money/views/views.service';
import { moneyHarness } from './money-harness';

/**
 * What the overview showed wrong on real data, fixed in the requirements as well as the code:
 * an account's class covers everything it holds (cash and units; an asset with classes of its
 * own counts there instead), money lent out is its own kind of account and stays out of the
 * allocation, a class can be removed, and a one-off like selling a car can be left out of the
 * month's income and the savings rate without leaving the books.
 */
describe('the overview on real money', () => {
  let app: TestingModule;
  let prisma: PrismaService;
  let accounts: AccountsService;
  let assets: AssetsService;
  let categories: CategoriesService;
  let movements: MovementsService;
  let views: ViewsService;
  const users: string[] = [];
  const asOf = new Date('2026-11-30T00:00:00Z');

  beforeAll(async () => {
    const h = await moneyHarness();
    app = h.app;
    prisma = h.prisma;
    accounts = app.get(AccountsService);
    assets = app.get(AssetsService);
    categories = app.get(CategoriesService);
    movements = app.get(MovementsService);
    views = app.get(ViewsService);
    for (const tag of ['allocation', 'oneoff']) users.push(await h.newUser(`overview-${tag}`));
  });

  afterAll(async () => {
    for (const id of users) await prisma.user.delete({ where: { id } });
    await app.close();
  });

  const post = (userId: string, kind: Parameters<MovementsService['post']>[1]['kind'], input: Record<string, unknown>) =>
    movements.post(userId, { kind, input }, { actor: 'user' });

  describe('allocation by account', () => {
    let userId: string;
    let equity: string;
    let emergency: string;
    let cash: string;
    let broker: string;
    let bonds: string;
    let etf: string;
    const rows = async () => (await views.allocation(userId, { base: 'PLN', asOf })).rows.map((r) => [r.name, r.value.value]);

    beforeAll(async () => {
      userId = users[0];
      equity = (await assets.createClass(userId, { name: 'Equity', targetPercent: '85' })).id;
      emergency = (await assets.createClass(userId, { name: 'Emergency fund', targetPercent: '10' })).id;
      cash = (await assets.createClass(userId, { name: 'Cash', targetPercent: '5' })).id;
      const on = '2026-11-01';
      const opening = (amount: string) => [{ currency: 'PLN', amount, date: on }];
      await accounts.create(userId, { name: 'mBank', type: 'bank', currencies: ['PLN'], classId: cash, openingBalances: opening('10000.00') });
      broker = (await accounts.create(userId, { name: 'IBKR', type: 'investment', currencies: ['PLN'], classId: equity, openingBalances: opening('5000.00') })).id;
      bonds = (await accounts.create(userId, { name: 'EDO', type: 'bonds', currencies: ['PLN'], classId: emergency, openingBalances: opening('3000.00') })).id;
      await accounts.create(userId, { name: 'Borrowed USD', type: 'lent', currencies: ['PLN'], openingBalances: opening('2000.00') });
      await accounts.create(userId, { name: 'Loan', type: 'debt', currencies: ['PLN'], openingBalances: opening('-500.00') });

      etf = (await assets.create(userId, { code: 'ETF', name: 'World ETF', quoteCurrency: 'PLN' })).id;
      const bond = (await assets.create(userId, { code: 'BOND', name: 'Treasury bond', quoteCurrency: 'PLN' })).id;
      await post(userId, 'buy', { date: '2026-11-02', accountId: broker, assetId: etf, units: '10', total: '1000.00', currency: 'PLN' });
      await post(userId, 'buy', { date: '2026-11-02', accountId: bonds, assetId: bond, units: '30', total: '3000.00', currency: 'PLN' });
      const prices = app.get(PricesService);
      await prices.record(userId, { assetId: etf, date: '2026-11-20', price: '120.00' });
      await prices.record(userId, { assetId: bond, date: '2026-11-20', price: '100.00' });
    });

    it("counts what each account holds in the account's class, cash and units alike", async () => {
      // IBKR: 4 000 cash + 10 ETF at 120; EDO: 30 bonds at 100; money lent out and debt stay out
      expect(await rows()).toEqual([
        ['Cash', '10000.00'],
        ['Emergency fund', '3000.00'],
        ['Equity', '5200.00'],
      ]);
      expect((await views.allocation(userId, { base: 'PLN', asOf })).total.value).toBe('18200.00');
    });

    it('counts an asset with classes of its own there, wherever it is held', async () => {
      await assets.setShares(userId, etf, [{ classId: cash, percent: '100' }]);
      expect(await rows()).toEqual([
        ['Cash', '11200.00'],
        ['Emergency fund', '3000.00'],
        ['Equity', '4000.00'],
      ]);
      await assets.setShares(userId, etf, []);
    });

    it('shows money lent out as its own line of what you own, outside the classes', async () => {
      const worth = await views.netWorth(userId, { base: 'PLN', asOf });
      expect(worth.types.find((t) => t.key === 'lent')).toMatchObject({ name: 'Lent out', value: { value: '2000.00' } });
      expect(worth.classes.map((c) => [c.name, c.value.value])).toEqual([
        ['Cash', '10000.00'],
        ['Emergency fund', '3000.00'],
        ['Equity', '5200.00'],
      ]);
    });

    it("removes a class: what was in it counts as not in a class, and its targets go with it", async () => {
      await assets.deleteClass(userId, emergency);
      expect(await rows()).toEqual([
        ['Cash', '10000.00'],
        ['Equity', '5200.00'],
        ['Not in a class', '3000.00'],
      ]);
      expect((await accounts.get(userId, bonds)).classId).toBeNull();
      expect((await assets.listClasses(userId)).map((c) => c.name)).toEqual(['Cash', 'Equity']);
      await expect(assets.deleteClass(userId, emergency)).rejects.toThrow(/not found/);
    });
  });

  describe('a one-off left out of the totals', () => {
    let userId: string;
    let mbank: string;

    beforeAll(async () => {
      userId = users[1];
      mbank = (await accounts.create(userId, { name: 'mBank', type: 'bank', currencies: ['PLN'] })).id;
    });

    it('keeps a car sold out of the income and the savings rate, and still shows it', async () => {
      const all = await categories.list(userId);
      const sold = all.find((c) => c.name === 'Sold belongings')!;
      expect(sold).toMatchObject({ kind: 'income', leftOutOfTotals: true });
      const salary = all.find((c) => c.name === 'Salary')!.id;
      await post(userId, 'income', { date: '2026-11-05', accountId: mbank, currency: 'PLN', amount: '5000.00', categoryId: salary });
      await post(userId, 'income', { date: '2026-11-16', accountId: mbank, currency: 'PLN', amount: '73000.00', categoryId: sold.id, note: 'Sell a Tesla' });
      await post(userId, 'expense', { date: '2026-11-17', accountId: mbank, currency: 'PLN', amount: '1000.00' });

      const month = await views.month(userId, '2026-11', 'PLN');
      expect([month.income.value, month.expenses.value, month.savingsRate]).toEqual(['5000.00', '1000.00', '80.0']);
      expect(month.incomeByCategory.map((c) => c.name)).toEqual(['Salary']);
      expect(month.leftOutByCategory.map((c) => [c.name, c.kind, c.value.value])).toEqual([['Sold belongings', 'income', '73000.00']]);
    });

    it('counts it again when the category is no longer left out', async () => {
      const sold = (await categories.list(userId)).find((c) => c.name === 'Sold belongings')!;
      await categories.update(userId, sold.id, { leftOutOfTotals: false });
      const month = await views.month(userId, '2026-11', 'PLN');
      expect(month.income.value).toBe('78000.00');
      expect(month.leftOutByCategory).toEqual([]);
    });
  });
});
