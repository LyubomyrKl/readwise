import type { TestingModule } from '@nestjs/testing';
import type { PrismaService } from '@platform/db/prisma.service';
import { AccountsService } from '@tools/money/accounts/accounts.service';
import { GoalsService } from '@tools/money/goals/goals.service';
import { ForecastService } from '@tools/money/views/forecast.service';
import { moneyHarness } from './money-harness';

/**
 * Finish lines: a net worth the person wants to reach, kept in its own currency, listed smallest
 * first, removed by its owner only, and handed to Insights with the forecast in the base currency,
 * where it is drawn across the way ahead.
 */
describe('finish lines', () => {
  let app: TestingModule;
  let prisma: PrismaService;
  let goals: GoalsService;
  const users: string[] = [];

  beforeAll(async () => {
    const h = await moneyHarness();
    app = h.app;
    prisma = h.prisma;
    goals = app.get(GoalsService);
    for (const tag of ['owner', 'other']) users.push(await h.newUser(`goals-${tag}`));
  });

  afterAll(async () => {
    for (const id of users) await prisma.user.delete({ where: { id } });
    await app.close();
  });

  it('keeps a net worth to reach in its own currency, smallest first', async () => {
    const flat = await goals.create(users[0], { name: 'Flat deposit', target: '300000', currency: 'PLN' });
    expect(flat).toMatchObject({ name: 'Flat deposit', target: { currency: 'PLN', value: '300000.00', minor: '30000000' } });
    await goals.create(users[0], { target: '200000.00', currency: 'PLN' });
    expect((await goals.list(users[0])).map((g) => [g.name, g.target.value])).toEqual([
      [null, '200000.00'],
      ['Flat deposit', '300000.00'],
    ]);
  });

  it('refuses one at zero, or in a currency it does not know', async () => {
    await expect(goals.create(users[0], { target: '0', currency: 'PLN' })).rejects.toThrow(/above zero/);
    await expect(goals.create(users[0], { target: '100', currency: 'XYZ' })).rejects.toThrow();
  });

  it("removes one by its owner, and never another person's", async () => {
    const [first] = await goals.list(users[0]);
    await expect(goals.remove(users[1], first.id)).rejects.toThrow(/not found/i);
    await goals.remove(users[0], first.id);
    expect((await goals.list(users[0])).map((g) => g.target.value)).toEqual(['300000.00']);
  });

  it('comes with the forecast, in the base currency', async () => {
    await app.get(AccountsService).create(users[0], { name: 'mBank', type: 'bank', currencies: ['PLN'], openingBalances: [{ currency: 'PLN', amount: '1000.00', date: '2026-01-01' }] });
    const f = await app.get(ForecastService).forecast(users[0], { base: 'PLN', asOf: new Date('2026-07-05T00:00:00Z') });
    expect(f.netWorth.goals.map((g) => [g.name, g.target.value])).toEqual([['Flat deposit', '300000.00']]);
  });
});
