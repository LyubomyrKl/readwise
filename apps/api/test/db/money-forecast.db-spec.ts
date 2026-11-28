import type { TestingModule } from '@nestjs/testing';
import type { PrismaService } from '@platform/db/prisma.service';
import { AccountsService } from '@tools/money/accounts/accounts.service';
import { CategoriesService } from '@tools/money/categories/categories.service';
import { MovementsService } from '@tools/money/movements/movements.service';
import { RecurringService } from '@tools/money/recurring/recurring.service';
import { ForecastService } from '@tools/money/views/forecast.service';
import { moneyHarness } from './money-harness';

/**
 * Where the money is heading, on a known history: six months of rent on the 1st, groceries on the
 * 5th, 15th and 25th and salary on the 10th, then June so far. This month projects as spent so far
 * plus what usually follows after the 20th, not as a straight line; each category the same way; the
 * year as so far, the rest of June and a usual month for each month left; net worth at the pace of
 * its month ends. A one-off sale stays out of income, as in the month's totals, and out of net
 * worth's pace (it is in today's net worth). The month is read at its last recorded day.
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
    for (const tag of ['history', 'new']) users.push(await h.newUser(`forecast-${tag}`));

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

  it('projects the year from so far, the rest of June and a usual month for each month left', async () => {
    const { year } = await forecasts.forecast(users[0], { base: 'PLN', asOf });
    const figures = (y: typeof year.soFar) => [y.income.value, y.expenses.value, y.savings.value, y.savingsRate];
    expect(year.year).toBe(2026);
    expect(figures(year.soFar)).toEqual(['30000.00', '13900.00', '16100.00', '53.7']);
    // + 100 of June still to come + 6 usual months of 5000 in and 2300 out
    expect(figures(year.projected)).toEqual(['60000.00', '27800.00', '32200.00', '53.7']);
    expect(year.lastYear).toMatchObject({ months: 1, income: { value: '5000.00' }, expenses: { value: '2300.00' }, savingsRate: '54.0' });
  });

  it("projects net worth at the pace of its month ends, the sale in today's worth but not in the pace", async () => {
    const { netWorth, runway } = await forecasts.forecast(users[0], { base: 'PLN', asOf });
    // month ends from December (2700) to today (28 800, the sale included)
    expect(netWorth.history.map((p) => p.total.value)).toEqual(['2700.00', '5400.00', '8100.00', '10800.00', '13500.00', '16200.00', '28800.00']);
    // 2700 a month, June 2600 once the 10 000 sale is taken out (not 4350 with it)
    expect(netWorth.monthlyChange?.value).toBe('2683.33');
    expect(netWorth.projection).toHaveLength(12);
    expect(netWorth.projection[0]).toMatchObject({ date: '2026-07-31', value: { value: '31483.33' } });
    expect(netWorth.projection[11]).toMatchObject({ date: '2027-06-30', value: { value: '60999.96' } });
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
});
