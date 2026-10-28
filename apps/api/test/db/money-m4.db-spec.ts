import type { TestingModule } from '@nestjs/testing';
import type { PrismaService } from '@platform/db/prisma.service';
import { AccountsService } from '@tools/money/accounts/accounts.service';
import { AssetsService } from '@tools/money/investments/assets.service';
import { PricesService } from '@tools/money/investments/prices.service';
import { MovementsService } from '@tools/money/movements/movements.service';
import { MoneySettingsService } from '@tools/money/settings/settings.service';
import { SnapshotsService } from '@tools/money/views/snapshots.service';
import { ViewsService } from '@tools/money/views/views.service';
import { moneyHarness } from './money-harness';

/**
 * M4 done-when: switching USD -> EUR -> PLN changes every total; the savings
 * rate matches a hand calculation for one month. Everything happens in March
 * 2027 so the shared rate table holds this test's rates alone.
 */
describe('M4 views', () => {
  let app: TestingModule;
  let prisma: PrismaService;
  let views: ViewsService;
  let settings: MoneySettingsService;
  let snapshots: SnapshotsService;
  let userId: string;
  const asOf = new Date('2027-03-31');

  beforeAll(async () => {
    const h = await moneyHarness();
    app = h.app;
    prisma = h.prisma;
    userId = await h.newUser('m4');
    views = app.get(ViewsService);
    settings = app.get(MoneySettingsService);
    snapshots = app.get(SnapshotsService);
    const accounts = app.get(AccountsService);
    const assets = app.get(AssetsService);
    const prices = app.get(PricesService);
    const movements = app.get(MovementsService);
    const post = (kind: Parameters<MovementsService['post']>[1]['kind'], input: Record<string, unknown>) =>
      movements.post(userId, { kind, input }, { actor: 'user' });

    for (const [date, pln, usd] of [
      ['2027-03-01', '4.25', '1.10'],
      ['2027-03-15', '4.30', '1.08'],
      ['2027-03-31', '4.40', '1.12'],
    ]) {
      for (const [to, rate] of [
        ['PLN', pln],
        ['USD', usd],
      ]) {
        const d = new Date(date);
        await prisma.moneyExchangeRate.upsert({
          where: { source_date_fromId_toId: { source: 'ecb', date: d, fromId: 'EUR', toId: to } },
          create: { source: 'ecb', date: d, fromId: 'EUR', toId: to, rate },
          update: { rate },
        });
      }
    }

    const core = await assets.createClass(userId, { name: 'Core equity', targetPercent: '70' });
    const emergency = await assets.createClass(userId, { name: 'Emergency fund', targetPercent: '30' });
    const bank = await accounts.createInstitution(userId, { name: 'mBank', kind: 'bank' });
    const zenInst = await accounts.createInstitution(userId, { name: 'ZEN', kind: 'bank' });
    const broker = await accounts.createInstitution(userId, { name: 'IBKR', kind: 'broker' });
    const lender = await accounts.createInstitution(userId, { name: 'Family', kind: 'lender' });
    const on = '2027-03-01';
    const mbank = await accounts.create(userId, { institutionId: bank.id, name: 'eKonto', type: 'bank', currencies: ['PLN'], openingBalances: [{ currency: 'PLN', amount: '10000.00', date: on }] });
    const zen = await accounts.create(userId, {
      institutionId: zenInst.id,
      name: 'ZEN',
      type: 'bank',
      currencies: ['EUR'],
      cashClassId: emergency.id,
      openingBalances: [{ currency: 'EUR', amount: '1000.00', date: on }],
    });
    const ibkr = await accounts.create(userId, { institutionId: broker.id, name: 'IBKR', type: 'investment', currencies: ['EUR'], openingBalances: [{ currency: 'EUR', amount: '500.00', date: on }] });
    await accounts.create(userId, { institutionId: lender.id, name: 'Borrowed USD', type: 'debt', currencies: ['USD'], openingBalances: [{ currency: 'USD', amount: '-2000.00', date: on }] });
    const vwce = await assets.create(userId, { code: 'VWCE', name: 'All-World', quoteCurrency: 'EUR', classes: [{ classId: core.id, percent: '100' }] });

    await post('income', { date: '2027-03-01', accountId: mbank.id, currency: 'PLN', amount: '12000.00', note: 'Salary' });
    await post('expense', { date: '2027-03-03', accountId: mbank.id, currency: 'PLN', amount: '3000.00', note: 'Rent' });
    await post('expense', { date: '2027-03-10', accountId: mbank.id, currency: 'PLN', amount: '1000.00', note: 'Groceries' });
    await post('expense', { date: '2027-03-15', accountId: zen.id, currency: 'EUR', amount: '100.00', note: 'Hotel' });
    await post('transfer', { date: '2027-03-20', fromAccountId: mbank.id, fromCurrency: 'PLN', amountOut: '4300.00', toAccountId: ibkr.id, toCurrency: 'EUR', amountIn: '1000.00' });
    await post('buy', { date: '2027-03-21', accountId: ibkr.id, assetId: vwce.id, units: '10', total: '1200.00', currency: 'EUR' });
    await prices.record(userId, { assetId: vwce.id, date: '2027-03-31', price: '125.00' });
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } });
    await app.close();
  });

  it('shows net worth in the base currency, and every total changes with it', async () => {
    // by hand at the 31 March rates (EUR->PLN 4.40, EUR->USD 1.12), each holding rounded once:
    // PLN: 13 700.00 + 3 960.00 + 1 320.00 + 5 500.00 - 7 857.14
    const pln = await views.netWorth(userId, { base: 'PLN', asOf });
    expect(pln.total.value).toBe('16622.86');
    expect(pln.liabilities.value).toBe('-7857.14');
    expect(pln.assets.value).toBe('24480.00');
    // EUR: 3 113.64 + 900.00 + 300.00 + 1 250.00 - 1 785.71
    const eur = await views.netWorth(userId, { base: 'EUR', asOf });
    expect(eur.total.value).toBe('3777.93');
    // USD: 3 487.27 + 1 008.00 + 336.00 + 1 400.00 - 2 000.00
    const usd = await views.netWorth(userId, { base: 'USD', asOf });
    expect(usd.total.value).toBe('4231.27');
    expect(new Set([pln.total.currency, eur.total.currency, usd.total.currency])).toEqual(new Set(['PLN', 'EUR', 'USD']));
    expect(pln.missingRates).toEqual([]);
  });

  it('follows the base currency in settings when none is asked for', async () => {
    for (const [base, total] of [
      ['USD', '4231.27'],
      ['EUR', '3777.93'],
      ['PLN', '16622.86'],
    ]) {
      await settings.update(userId, { baseCurrency: base });
      const home = await views.netWorth(userId, { asOf });
      expect([home.base, home.total.value]).toEqual([base, total]);
    }
  });

  it('breaks net worth down by account, currency, type and class', async () => {
    const nw = await views.netWorth(userId, { base: 'PLN', asOf });
    expect(nw.currencies.map((c) => [c.name, c.native?.value, c.value.value])).toEqual([
      ['PLN', '13700.00', '13700.00'],
      ['EUR', '2450.00', '10780.00'],
      ['USD', '-2000.00', '-7857.14'],
    ]);
    expect(Object.fromEntries(nw.types.map((t) => [t.key, t.value.value]))).toEqual({
      bank: '17660.00',
      investment: '6820.00',
      debt: '-7857.14',
    });
    expect(nw.accounts.find((a) => a.name === 'IBKR')?.items.map((i) => [i.code, i.valuedBy, i.value?.value])).toEqual([
      ['EUR', 'balance', '1320.00'],
      ['VWCE', 'price', '5500.00'],
    ]);
  });

  it('matches the hand calculation of the March savings rate', async () => {
    // income 12 000.00; expenses 3 000.00 + 1 000.00 + 100 EUR at 4.30 = 4 430.00;
    // savings 7 570.00 = 63.08% of income; invested: the 4 300.00 sent to the broker
    const march = await views.month(userId, '2027-03', 'PLN');
    expect(march.income.value).toBe('12000.00');
    expect(march.expenses.value).toBe('4430.00');
    expect(march.savings.value).toBe('7570.00');
    expect(march.savingsRate).toBe('63.1');
    expect(march.invested.value).toBe('4300.00');
    expect(march.expensesByCategory.map((c) => [c.name, c.value.value])).toEqual([['Other expenses', '4430.00']]);

    const series = await views.monthly(userId, { base: 'PLN', from: '2027-01', to: '2027-03' });
    expect(series.months.map((m) => [m.month, m.income.value, m.savingsRate])).toEqual([
      ['2027-01', '0.00', null],
      ['2027-02', '0.00', null],
      ['2027-03', '12000.00', '63.1'],
    ]);
  });

  it('compares the allocation with the targets', async () => {
    const a = await views.allocation(userId, { base: 'PLN', asOf });
    expect(a.total.value).toBe('24480.00');
    expect(a.rows.map((r) => [r.name, r.value.value, r.percent, r.targetPercent, r.drift, r.driftAmount?.value ?? null])).toEqual([
      ['Core equity', '5500.00', '22.5', '70', '-47.5', '-11636.00'],
      ['Emergency fund', '3960.00', '16.2', '30', '-13.8', '-3384.00'],
      ['Not in a class', '15020.00', '61.4', null, null, null],
    ]);
    expect(a.targetsTotal).toBe('100');
  });

  it('draws net worth over time and freezes a quarterly snapshot', async () => {
    const history = await views.history(userId, { base: 'PLN', from: '2027-01', to: '2027-03' });
    expect(history.points.map((p) => [p.date, p.total.value])).toEqual([
      ['2027-01-31', '0.00'],
      ['2027-02-28', '0.00'],
      ['2027-03-31', '16622.86'],
    ]);
    const fromStart = await views.history(userId, { base: 'PLN', from: 'start', to: '2027-03' });
    expect(fromStart.points.map((p) => p.date)).toEqual(['2027-03-31']);
    const snap = await snapshots.take(userId, { date: asOf, label: 'Q1 2027' });
    expect(snap.netWorth.value).toBe('16622.86');
    expect((await snapshots.list(userId)).map((s) => s.label)).toEqual(['Q1 2027']);
  });
});
