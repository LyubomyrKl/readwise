import type { TestingModule } from '@nestjs/testing';
import type { PrismaService } from '@platform/db/prisma.service';
import { AccountsService } from '@tools/money/accounts/accounts.service';
import { CategoriesService } from '@tools/money/categories/categories.service';
import { AssetsService } from '@tools/money/investments/assets.service';
import { PricesService } from '@tools/money/investments/prices.service';
import { MovementsService } from '@tools/money/movements/movements.service';
import { RecurringService } from '@tools/money/recurring/recurring.service';
import { MoneySettingsService } from '@tools/money/settings/settings.service';
import { ForecastService } from '@tools/money/views/forecast.service';
import { moneyHarness } from './money-harness';

/**
 * Where the money is heading, on a known history: six months of rent on the 1st, groceries on the
 * 5th, 15th and 25th and salary on the 10th, then June so far. This month projects as spent so far
 * plus what usually follows after the 20th, not as a straight line; each category the same way; the
 * year as so far, the rest of June and an average month for each month left; net worth ahead from
 * what is saved in an average month. A one-off sale stays out of income, as in the month's totals,
 * and out of what is saved (it is in today's net worth). The month is read at its last recorded day.
 * Then a second history: each month's change of net worth told apart (saved, a price, an account
 * added, a sale), investments at the expected return of the settings, and a holiday that makes
 * the average month dearer than the usual one. Last, a tax paid from April on: over the whole half
 * year it is "now and then", learning only from the months since April it is the usual month.
 */
describe('the forecast', () => {
  let app: TestingModule;
  let prisma: PrismaService;
  let forecasts: ForecastService;
  const users: string[] = [];
  const asOf = new Date('2026-06-20T00:00:00Z');

  beforeAll(async () => {
    const h = await moneyHarness();
    app = h.app;
    prisma = h.prisma;
    forecasts = app.get(ForecastService);
    for (const tag of ['history', 'new', 'worth', 'taxes', 'gap']) users.push(await h.newUser(`forecast-${tag}`));

    const accounts = app.get(AccountsService);
    const movements = app.get(MovementsService);
    const categories = app.get(CategoriesService);
    const userId = users[0];
    const mbank = (await accounts.create(userId, { name: 'mBank', type: 'bank', currencies: ['PLN'] })).id;
    const all = await categories.list(userId);
    const category = (name: string) => all.find((c) => c.name === name)!.id;
    const post = (kind: 'expense' | 'income', date: string, amount: string, name: string) =>
      movements.post(userId, { kind, input: { date, accountId: mbank, currency: 'PLN', amount, categoryId: category(name) } }, { actor: 'user' });

    for (const month of ['2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05']) {
      await post('expense', `${month}-01`, '2000.00', 'Housing');
      for (const day of ['05', '15', '25']) await post('expense', `${month}-${day}`, '100.00', 'Groceries');
      await post('income', `${month}-10`, '5000.00', 'Salary');
    }
    await post('expense', '2026-06-01', '2000.00', 'Housing');
    await post('expense', '2026-06-05', '150.00', 'Groceries');
    await post('income', '2026-06-10', '5000.00', 'Salary');
    await post('income', '2026-06-12', '10000.00', 'Sold belongings'); // a one-off, left out of income
    await post('expense', '2026-06-15', '250.00', 'Groceries');
    await app.get(RecurringService).create(userId, {
      name: 'Internet',
      kind: 'expense',
      template: { accountId: mbank, currency: 'PLN', amount: '60.00', categoryId: category('Bills and utilities') },
      schedule: 'FREQ=MONTHLY;BYMONTHDAY=28',
      startDate: '2026-01-28',
    });
  });

  afterAll(async () => {
    for (const id of users) await prisma.user.delete({ where: { id } });
    await app.close();
  });

  it('projects the month as spent so far plus what usually follows after this day', async () => {
    const f = await forecasts.forecast(users[0], { base: 'PLN', asOf });
    // nothing recorded after the 15th: the month is read there
    expect([f.month, f.day, f.daysInMonth, f.recordedThrough, f.method, f.basisMonths]).toEqual(['2026-06', 20, 30, 15, 'history', 6]);
    const values = (p: typeof f.expenses) => [p.soFar, p.typicalByNow, p.projected, p.low, p.high, p.typicalMonth].map((a) => a?.value ?? null);
    // 2400 so far, 2200 usual by the 15th; what follows the 15th is usually the last 100 of groceries
    expect(values(f.expenses)).toEqual(['2400.00', '2200.00', '2500.00', '2500.00', '2500.00', '2300.00']);
    // the salary is in; the sale of a car is not income
    expect(values(f.income)).toEqual(['5000.00', '5000.00', '5000.00', '5000.00', '5000.00', '5000.00']);
    expect([f.savings.value, f.savingsRate]).toEqual(['2500.00', '50.0']);
  });

  it('draws the month day by day against the usual one', async () => {
    const { days } = await forecasts.forecast(users[0], { base: 'PLN', asOf });
    expect(days).toHaveLength(30);
    expect(days[0]).toMatchObject({ day: 1, actual: { value: '2000.00' }, typical: { value: '2000.00' } });
    expect(days[14]).toMatchObject({ day: 15, actual: { value: '2400.00' }, typical: { value: '2200.00' } });
    expect(days[15].actual).toBeNull(); // recorded through the 15th
    expect(days[29].typical?.value).toBe('2300.00');
  });

  it('puts the category furthest from its usual month first', async () => {
    const { categories } = await forecasts.forecast(users[0], { base: 'PLN', asOf });
    expect(categories.map((c) => [c.name, c.soFar.value, c.projected.value, c.typicalMonth?.value, c.change])).toEqual([
      ['Groceries', '400.00', '500.00', '300.00', '66.7'],
      ['Housing', '2000.00', '2000.00', '2000.00', '0.0'],
    ]);
  });

  it('projects the year from so far, the rest of June and an average month for each month left', async () => {
    const { year } = await forecasts.forecast(users[0], { base: 'PLN', asOf });
    const figures = (y: typeof year.soFar) => [y.income.value, y.expenses.value, y.savings.value, y.savingsRate];
    expect(year.year).toBe(2026);
    expect(figures(year.soFar)).toEqual(['30000.00', '13900.00', '16100.00', '53.7']);
    // + 100 of June still to come + 6 usual months of 5000 in and 2300 out
    expect(figures(year.projected)).toEqual(['60000.00', '27800.00', '32200.00', '53.7']);
    expect(year.lastYear).toMatchObject({ months: 1, income: { value: '5000.00' }, expenses: { value: '2300.00' }, savingsRate: '54.0' });
  });

  it("projects net worth from what an average month saves, the sale in today's worth but never a month saved", async () => {
    const { netWorth, runway } = await forecasts.forecast(users[0], { base: 'PLN', asOf });
    // month ends from December (2700) to today (28 800, the sale included)
    expect(netWorth.history.map((p) => p.total.value)).toEqual(['2700.00', '5400.00', '8100.00', '10800.00', '13500.00', '16200.00', '28800.00']);
    // 5000 in, 2300 out in each of the six months before June; nothing invested, no return set
    expect([netWorth.monthlySaving?.value, netWorth.invested.value, netWorth.expectedReturn]).toEqual(['2700.00', '0.00', '0']);
    // ten years of month ends ahead
    expect(netWorth.projection).toHaveLength(120);
    // today, then the 100 of June's groceries still to come, then 2700 a month
    expect(netWorth.projection[0]).toMatchObject({ date: '2026-07-31', value: { value: '31400.00' } });
    expect(netWorth.projection[11]).toMatchObject({ date: '2027-06-30', value: { value: '61100.00' } });
    // June so far: 2600 saved and the 10 000 sale, apart
    expect(netWorth.months.at(-1)).toMatchObject({ month: '2026-06', change: { value: '12600.00' }, saved: { value: '2600.00' }, oneOffs: { value: '10000.00' } });
    expect([runway.liquid.value, runway.monthlyExpenses?.value, runway.months]).toEqual(['28800.00', '2300.00', '12.5']);
  });

  it('reads the month at its last recorded day, so a late import is not a quiet month', async () => {
    // the 28th, nothing recorded since the 15th: what usually follows the 15th still counts (groceries on the 25th)
    const f = await forecasts.forecast(users[0], { base: 'PLN', asOf: new Date('2026-06-28T00:00:00Z') });
    expect([f.day, f.recordedThrough, f.expenses.soFar.value, f.expenses.projected.value]).toEqual([28, 15, '2400.00', '2500.00']);
  });

  it('shows a month with nothing in it yet as a usual month', async () => {
    const f = await forecasts.forecast(users[0], { base: 'PLN', asOf: new Date('2026-07-20T00:00:00Z') });
    expect([f.recordedThrough, f.expenses.soFar.value, f.expenses.projected.value, f.expenses.typicalMonth?.value, f.expenses.change]).toEqual([
      0,
      '0.00',
      '2300.00',
      '2300.00',
      '0.0',
    ]);
    expect(f.income.projected.value).toBe('5000.00');
    expect(f.days.every((d) => d.actual === null)).toBe(true);
  });

  it('lists what is still scheduled this month', async () => {
    const { upcoming } = await forecasts.forecast(users[0], { base: 'PLN', asOf });
    expect(upcoming).toEqual([{ date: '2026-06-28', name: 'Internet', kind: 'expense', amount: { currency: 'PLN', minor: '6000', value: '60.00' } }]);
  });

  it('draws a straight line for a first month, and the year from it', async () => {
    const userId = users[1];
    const wallet = (await app.get(AccountsService).create(userId, { name: 'Wallet', type: 'bank', currencies: ['PLN'] })).id;
    await app.get(MovementsService).post(
      userId,
      { kind: 'expense', input: { date: '2026-06-02', accountId: wallet, currency: 'PLN', amount: '300.00' } },
      { actor: 'user' },
    );
    const f = await forecasts.forecast(userId, { base: 'PLN', asOf: new Date('2026-06-10T00:00:00Z') });
    expect([f.method, f.basisMonths, f.expenses.projected.value, f.expenses.typicalMonth]).toEqual(['pace', 0, '900.00', null]);
    expect(f.days.every((d) => d.typical === null)).toBe(true);
    expect(f.categories[0].change).toBeNull();
    // 300 + 600 more this month + 6 months like this one
    expect(f.year.projected.expenses.value).toBe('6300.00');
    expect([f.runway.months, f.netWorth.projection]).toEqual([null, []]);
  });

  describe('where net worth comes from, and costs that come in lumps', () => {
    const at = new Date('2026-06-20T00:00:00Z');

    beforeAll(async () => {
      const userId = users[2];
      const accounts = app.get(AccountsService);
      const movements = app.get(MovementsService);
      const all = await app.get(CategoriesService).list(userId);
      const category = (name: string) => all.find((c) => c.name === name)!.id;
      const post = (kind: Parameters<MovementsService['post']>[1]['kind'], input: Record<string, unknown>) =>
        movements.post(userId, { kind, input }, { actor: 'user' });
      const mbank = (await accounts.create(userId, { name: 'mBank', type: 'bank', currencies: ['PLN'] })).id;
      const ibkr = (await accounts.create(userId, { name: 'IBKR', type: 'investment', currencies: ['PLN'] })).id;
      const flow = (kind: 'income' | 'expense', date: string, amount: string, name: string) =>
        post(kind, { date, accountId: mbank, currency: 'PLN', amount, categoryId: category(name) });

      // a salary that moves a little, groceries of 1000 (600 so far in June)
      for (const [month, salary] of [
        ['01', '4000.00'],
        ['02', '4500.00'],
        ['03', '4000.00'],
        ['04', '3500.00'],
        ['05', '4000.00'],
        ['06', '4000.00'],
      ]) {
        await flow('income', `2026-${month}-10`, salary, 'Salary');
        await flow('expense', `2026-${month}-15`, month === '06' ? '600.00' : '1000.00', 'Groceries');
      }
      await flow('expense', '2026-03-20', '1500.00', 'Leisure'); // a holiday, once
      await flow('income', '2026-05-20', '2000.00', 'Sold belongings');
      // 1000 to the broker and ten ETF bought with it: 100 each then, 120 at April's end, 130 in June
      await post('transfer', { date: '2026-02-05', fromAccountId: mbank, fromCurrency: 'PLN', amountOut: '1000.00', toAccountId: ibkr, toCurrency: 'PLN' });
      const etf = (await app.get(AssetsService).create(userId, { code: 'ETF', name: 'World ETF', quoteCurrency: 'PLN' })).id;
      await post('buy', { date: '2026-02-05', accountId: ibkr, assetId: etf, units: '10', total: '1000.00', currency: 'PLN' });
      for (const [date, price] of [
        ['2026-02-05', '100.00'],
        ['2026-04-30', '120.00'],
        ['2026-06-15', '130.00'],
      ])
        await app.get(PricesService).record(userId, { assetId: etf, date, price });
      // cash that was there all along, tracked from the 10th of March
      await accounts.create(userId, { name: 'Cash', type: 'bank', currencies: ['PLN'], openingBalances: [{ currency: 'PLN', amount: '5000.00', date: '2026-03-10' }] });
      await app.get(MoneySettingsService).update(userId, { expectedReturn: '6' });
    });

    it("tells each month's change apart: saved, markets and exchange rates, one-offs, accounts added", async () => {
      const { netWorth } = await forecasts.forecast(users[2], { base: 'PLN', asOf: at });
      expect(netWorth.months.map((m) => [m.month, m.change.value, m.saved.value, m.markets.value, m.oneOffs.value, m.added.value])).toEqual([
        ['2026-01', '3000.00', '3000.00', '0.00', '0.00', '0.00'],
        ['2026-02', '3500.00', '3500.00', '0.00', '0.00', '0.00'],
        // the holiday leaves 1500 saved; the cash account adds 5000 that was never saved here
        ['2026-03', '6500.00', '1500.00', '0.00', '0.00', '5000.00'],
        // the ETF at 120: +200
        ['2026-04', '2700.00', '2500.00', '200.00', '0.00', '0.00'],
        ['2026-05', '5000.00', '3000.00', '0.00', '2000.00', '0.00'],
        // June so far, the ETF at 130
        ['2026-06', '3500.00', '3400.00', '100.00', '0.00', '0.00'],
      ]);
    });

    it('projects from the average month saved, plus what is invested at the expected return', async () => {
      const { netWorth } = await forecasts.forecast(users[2], { base: 'PLN', asOf: at });
      // saved 3000, 3500, 1500, 2500 and 3000: 2700 on average, quartiles 2500 and 3000
      expect([netWorth.monthlySaving?.value, netWorth.invested.value, netWorth.expectedReturn]).toEqual(['2700.00', '1300.00', '6']);
      // 24 200 today + 2700 + 6% of 1300 for a month (6.50); the range: 250 (half the spread) × √(1 + 1/5)
      expect(netWorth.projection[0]).toMatchObject({ date: '2026-07-31', value: { value: '26906.50' }, low: { value: '26632.64' }, high: { value: '27180.36' } });
      // + 12 months of 2700 + 6% of 1300 for a year (78); 250 × √(12 + 144/5)
      expect(netWorth.projection[11]).toMatchObject({ date: '2027-06-30', value: { value: '56678.00' }, low: { value: '55081.13' }, high: { value: '58274.87' } });
      // two years: 6% again on 1378 (160.68 in all); ten
      expect(netWorth.projection[23]).toMatchObject({ date: '2028-06-30', value: { value: '89160.68' } });
      expect(netWorth.projection[119]).toMatchObject({ date: '2036-06-30', value: { value: '349228.09' } });
      // grown since the first month end (3000); spending 10% less: 130 a month (1300 on average)
      expect([netWorth.grown?.since, netWorth.grown?.change.value, netWorth.lever?.value]).toEqual(['2026-01-31', '21200.00', '130.00']);
    });

    it('counts the lumps in totals: the year and the safety net take the average month, not the usual one', async () => {
      const { year, runway } = await forecasts.forecast(users[2], { base: 'PLN', asOf: at });
      // usually 1000 spent a month, 1300 on average with the holiday; six months left of 4000 in, 1300 out
      expect([year.projected.income.value, year.projected.expenses.value]).toEqual(['48000.00', '14900.00']);
      // mBank and the cash: 22 900, against 1300 a month
      expect([runway.liquid.value, runway.monthlyExpenses?.value, runway.months]).toEqual(['22900.00', '1300.00', '17.6']);
    });

    it('shows a category that comes in lumps as one, without calling its month unusual', async () => {
      const { categories } = await forecasts.forecast(users[2], { base: 'PLN', asOf: at });
      const row = (name: string) => categories.find((c) => c.name === name)!;
      const groceries = row('Groceries');
      expect([groceries.typicalMonth?.value, groceries.averageMonth?.value, groceries.monthsWith, groceries.lumpy, groceries.change]).toEqual(['1000.00', '1000.00', 5, false, '-40.0']);
      // nothing this month, usually nothing; 300 a month on average, in one month of five
      const leisure = row('Leisure');
      expect([leisure.projected.value, leisure.typicalMonth?.value, leisure.averageMonth?.value, leisure.monthsWith, leisure.lumpy, leisure.change]).toEqual([
        '0.00',
        '0.00',
        '300.00',
        1,
        true,
        null,
      ]);
    });
  });

  describe('learning from the months the person chooses', () => {
    const july = new Date('2026-07-05T00:00:00Z');
    const settings = () => app.get(MoneySettingsService);
    const learn = async (range: Record<string, string | null>) => {
      await settings().update(users[3], range);
      return forecasts.forecast(users[3], { base: 'PLN', asOf: july });
    };

    beforeAll(async () => {
      const userId = users[3];
      const mbank = (await app.get(AccountsService).create(userId, { name: 'mBank', type: 'bank', currencies: ['PLN'] })).id;
      const all = await app.get(CategoriesService).list(userId);
      const flow = (kind: 'income' | 'expense', date: string, amount: string, name: string) =>
        app
          .get(MovementsService)
          .post(userId, { kind, input: { date, accountId: mbank, currency: 'PLN', amount, categoryId: all.find((c) => c.name === name)!.id } }, { actor: 'user' });
      for (const month of ['01', '02', '03', '04', '05', '06']) {
        await flow('income', `2026-${month}-10`, '6000.00', 'Salary');
        await flow('expense', `2026-${month}-15`, '1000.00', 'Groceries');
        // taxes from April on
        if (month >= '04') await flow('expense', `2026-${month}-25`, '1500.00', 'Taxes');
      }
    });

    it('takes the last twelve months by default: the tax looks like it comes now and then', async () => {
      const f = await forecasts.forecast(users[3], { base: 'PLN', asOf: july });
      expect([f.range, f.basisMonths, f.basisFrom, f.basisTo, f.method, f.firstMonth]).toEqual(['last_12_months', 6, '2026-01', '2026-06', 'history', '2026-01']);
      // months of 1000 and of 2500: usually 1750
      expect([f.expenses.projected.value, f.expenses.typicalMonth?.value]).toEqual(['1750.00', '1750.00']);
      const taxes = f.categories.find((c) => c.name === 'Taxes')!;
      expect([taxes.monthsWith, taxes.lumpy, taxes.averageMonth?.value]).toEqual([3, true, '750.00']);
      expect(f.netWorth.monthlySaving?.value).toBe('4250.00');
    });

    it('learns from the last three months: the tax is part of the usual month', async () => {
      const f = await learn({ forecastRange: 'last_3_months' });
      expect([f.range, f.basisMonths, f.basisFrom, f.basisTo]).toEqual(['last_3_months', 3, '2026-04', '2026-06']);
      expect([f.expenses.projected.value, f.expenses.typicalMonth?.value]).toEqual(['2500.00', '2500.00']);
      const taxes = f.categories.find((c) => c.name === 'Taxes')!;
      expect([taxes.projected.value, taxes.typicalMonth?.value, taxes.lumpy, taxes.change]).toEqual(['1500.00', '1500.00', false, '0.0']);
      // the safety net follows: 2500 out a month
      expect(f.runway.monthlyExpenses?.value).toBe('2500.00');
      // net worth ahead does not: what the last twelve months saved, 4250 over the six there are
      expect([f.netWorth.monthlySaving?.value, f.netWorth.savingMonths]).toEqual(['4250.00', 6]);
      expect(f.netWorth.months.map((m) => m.month)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07']);
    });

    it('follows last month alone when that is the choice, and this year from January', async () => {
      const last = await learn({ forecastRange: 'last_month' });
      expect([last.basisMonths, last.basisFrom, last.method, last.expenses.projected.value]).toEqual([1, '2026-06', 'history', '2500.00']);
      const year = await learn({ forecastRange: 'this_year' });
      expect([year.basisMonths, year.basisFrom, year.basisTo]).toEqual([6, '2026-01', '2026-06']);
    });

    it('takes a custom range: open since a month, or between two', async () => {
      const since = await learn({ forecastRange: 'custom', forecastSince: '2026-04', forecastUntil: null });
      expect([since.range, since.since, since.until, since.basisMonths, since.expenses.projected.value]).toEqual(['custom', '2026-04', null, 3, '2500.00']);
      // the first quarter, before the tax: groceries only
      const quarter = await learn({ forecastRange: 'custom', forecastSince: '2026-01', forecastUntil: '2026-03' });
      expect([quarter.basisFrom, quarter.basisTo, quarter.expenses.projected.value]).toEqual(['2026-01', '2026-03', '1000.00']);
      expect(quarter.categories.map((c) => c.name)).toEqual(['Groceries']);
      // never before the first movement
      const early = await learn({ forecastRange: 'custom', forecastSince: '2025-09', forecastUntil: null });
      expect([early.basisMonths, early.basisFrom, early.since]).toEqual([6, '2026-01', '2025-09']);
    });

    it('refuses a custom range without its start, or ending before it', async () => {
      await settings().update(users[3], { forecastSince: null, forecastUntil: null, forecastRange: 'last_12_months' });
      await expect(settings().update(users[3], { forecastRange: 'custom' })).rejects.toThrow(/start/);
      await expect(settings().update(users[3], { forecastRange: 'custom', forecastSince: '2026-05', forecastUntil: '2026-03' })).rejects.toThrow(/before/);
      expect((await settings().get(users[3])).forecastRange).toBe('last_12_months');
    });
  });

  it('learns only from months with something recorded: a month without is not a month of nothing spent', async () => {
    const userId = users[4];
    const accounts = app.get(AccountsService);
    const mbank = (await accounts.create(userId, { name: 'mBank', type: 'bank', currencies: ['PLN'] })).id;
    const all = await app.get(CategoriesService).list(userId);
    const post = (kind: Parameters<MovementsService['post']>[1]['kind'], input: Record<string, unknown>) =>
      app.get(MovementsService).post(userId, { kind, input }, { actor: 'user' });
    for (const month of ['01', '02', '03', '06']) {
      await post('income', { date: `2026-${month}-10`, accountId: mbank, currency: 'PLN', amount: '5000.00', categoryId: all.find((c) => c.name === 'Salary')!.id });
      await post('expense', { date: `2026-${month}-15`, accountId: mbank, currency: 'PLN', amount: '1000.00', categoryId: all.find((c) => c.name === 'Groceries')!.id });
    }
    // April: only a holding owned from before, written down on the day it was bought; May: nothing
    const ibkr = (await accounts.create(userId, { name: 'IBKR', type: 'investment', currencies: ['PLN'] })).id;
    const etf = (await app.get(AssetsService).create(userId, { code: 'ETF', name: 'World ETF', quoteCurrency: 'PLN' })).id;
    await post('buy', { date: '2026-04-20', accountId: ibkr, assetId: etf, units: '1', total: '100.00', currency: 'PLN', heldBefore: true });
    const july = new Date('2026-07-05T00:00:00Z');
    const f = await forecasts.forecast(userId, { base: 'PLN', asOf: july });
    expect([f.basisMonths, f.basisFrom, f.basisTo, f.expenses.typicalMonth?.value, f.expenses.low.value]).toEqual([4, '2026-01', '2026-06', '1000.00', '1000.00']);
    expect([f.netWorth.savingMonths, f.netWorth.monthlySaving?.value]).toEqual([4, '4000.00']);
    // a custom range reaching far back the same
    await app.get(MoneySettingsService).update(userId, { forecastRange: 'custom', forecastSince: '2024-12' });
    const g = await forecasts.forecast(userId, { base: 'PLN', asOf: july });
    expect([g.basisMonths, g.basisFrom, g.expenses.low.value]).toEqual([4, '2026-01', '1000.00']);
  });
});
