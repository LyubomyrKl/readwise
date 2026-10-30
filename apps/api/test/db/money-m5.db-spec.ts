import { readFileSync } from 'fs';
import { join } from 'path';
import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import type { PrismaService } from '@platform/db/prisma.service';
import { AccountsService } from '@tools/money/accounts/accounts.service';
import { MoneyJobs } from '@tools/money/automation/money-jobs';
import { MoneyScheduler } from '@tools/money/automation/money-scheduler';
import { addDays, formatDate, parseDate } from '@tools/money/core/dates';
import { MoneyHttp } from '@tools/money/feeds/http.service';
import { PriceFeedService } from '@tools/money/feeds/price-feed.service';
import { RateFeedService } from '@tools/money/feeds/rate-feed.service';
import { ImportsService } from '@tools/money/imports/imports.service';
import { AssetsService } from '@tools/money/investments/assets.service';
import { PositionsService } from '@tools/money/investments/positions.service';
import { MovementsService } from '@tools/money/movements/movements.service';
import { RecurringService } from '@tools/money/recurring/recurring.service';
import { TaxService } from '@tools/money/tax/tax.service';
import { SnapshotsService } from '@tools/money/views/snapshots.service';
import { moneyHarness } from './money-harness';

/**
 * M5 done-when: rates arrive without anyone asking; last month's IBKR trades
 * import with no duplicates; the tax report matches the lots. Everything
 * happens between June and September 2027, so the shared rate table holds this
 * test's rates alone; the feeds answer from fixtures.
 */

// rates by month, the same every business day of it
const NBP: Record<string, Record<string, string>> = {
  '2027-05': { EUR: '4.2000', USD: '3.7500' },
  '2027-06': { EUR: '4.2500', USD: '3.8000' },
  '2027-07': { EUR: '4.3000', USD: '3.8500' },
  '2027-08': { EUR: '4.3500', USD: '3.9000' },
  '2027-09': { EUR: '4.4000', USD: '3.9500' },
};
const ECB: Record<string, Record<string, string>> = {
  '2027-05': { PLN: '4.2010', USD: '1.1200' },
  '2027-06': { PLN: '4.2510', USD: '1.1180' },
  '2027-07': { PLN: '4.3010', USD: '1.1170' },
  '2027-08': { PLN: '4.3510', USD: '1.1150' },
  '2027-09': { PLN: '4.4010', USD: '1.1140' },
};
const FIRST = '2027-05-20';
const LAST = '2027-09-30';

function businessDays(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = parseDate(from); d <= parseDate(to); d = addDays(d, 1)) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) out.push(formatDate(d));
  }
  return out;
}

const clamp = (from: string, to: string): [string, string] => [from < FIRST ? FIRST : from, to > LAST ? LAST : to];

function ecbXml(): string {
  const days = businessDays(FIRST, LAST).reverse();
  const cubes = days
    .map((d) => `<Cube time="${d}">${Object.entries(ECB[d.slice(0, 7)]).map(([c, r]) => `<Cube currency="${c}" rate="${r}"/>`).join('')}</Cube>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?><gesmes:Envelope><Cube>${cubes}</Cube></gesmes:Envelope>`;
}

function nbpJson(from: string, to: string): string | null {
  const [a, b] = clamp(from, to);
  const days = a <= b ? businessDays(a, b) : [];
  if (days.length === 0) return null;
  return JSON.stringify(
    days.map((d, i) => ({
      table: 'A',
      no: `${i + 1}/A/NBP/2027`,
      effectiveDate: d,
      rates: Object.entries(NBP[d.slice(0, 7)]).map(([code, mid]) => ({ currency: code, code, mid: Number(mid) })),
    })),
  ).replace(/"mid":(\d+(?:\.\d+)?)/g, (_, n: string) => `"mid":${NBP_DIGITS.get(n) ?? n}`);
}
// keep the published four places (JSON.stringify drops trailing zeros)
const NBP_DIGITS = new Map(Object.values(NBP).flatMap((m) => Object.values(m).map((v) => [String(Number(v)), v])));

const fixture = (name: string) => readFileSync(join(__dirname, '../fixtures/money', name));

describe('M5 automation', () => {
  let app: TestingModule;
  let prisma: PrismaService;
  let userId: string;
  let ibkr: string;
  let mbank: string;
  let vwce: string;
  let juneBuyLot: string;
  let jobs: MoneyJobs;
  let scheduler: MoneyScheduler;
  let rateFeed: RateFeedService;
  let imports: ImportsService;
  let movements: MovementsService;
  const requests: string[] = [];

  beforeAll(async () => {
    const h = await moneyHarness();
    app = h.app;
    prisma = h.prisma;
    userId = await h.newUser('m5');
    rateFeed = app.get(RateFeedService);
    imports = app.get(ImportsService);
    // only this test uses these months of the shared rate table: start them empty
    await prisma.moneyExchangeRate.deleteMany({ where: { source: { in: ['ecb', 'nbp'] }, date: { gte: parseDate('2027-05-01'), lte: parseDate('2027-12-31') } } });
    movements = app.get(MovementsService);

    jest.spyOn(app.get(MoneyHttp), 'get').mockImplementation(async (url: string) => {
      requests.push(url);
      if (url.includes('eurofxref')) return { status: 200, text: ecbXml() };
      const nbp = /tables\/A\/(\d{4}-\d{2}-\d{2})\/(\d{4}-\d{2}-\d{2})/.exec(url);
      if (nbp) {
        const body = nbpJson(nbp[1], nbp[2]);
        return body ? { status: 200, text: body } : { status: 404, text: '404 NotFound - Not Found - Brak danych' };
      }
      const yahoo = (stamps: string, closes: string) =>
        `{"chart":{"result":[{"meta":{"currency":"EUR","symbol":"VWCE.DE","gmtoffset":7200,"priceHint":2},"timestamp":[${stamps}],"indicators":{"quote":[{"close":[${closes}]}]}}],"error":null}}`;
      // 2027-06-30 and 2027-07-30 at 07:00 UTC; then 2027-08-20
      if (url.includes('/v8/finance/chart/VWCE.DE?range=10y')) return { status: 200, text: yahoo('1814338800,1816930800', '121.0999984741211,126.4000015258789') };
      if (url.includes('/v8/finance/chart/VWCE.DE?range=5d')) return { status: 200, text: yahoo('1818745200', '130.5') };
      return { status: 404, text: '' };
    });

    const runner = { registerHandler: () => undefined };
    jobs = new MoneyJobs(runner as never, rateFeed, app.get(PriceFeedService), app.get(RecurringService), app.get(SnapshotsService));
    // the scheduler enqueues into the job table, as JobsService.create does, without a queue
    let enqueueAt = new Date();
    const fakeJobs = {
      enqueue: (input: { type: string; toolId: string; userId: string; payload: Record<string, unknown> }) =>
        prisma.job.create({ data: { type: input.type, toolId: input.toolId, userId: input.userId, payload: input.payload as object, createdAt: enqueueAt } }),
    };
    scheduler = new MoneyScheduler(prisma, fakeJobs as never, app.get(PriceFeedService), app.get(ConfigService));
    (scheduler as unknown as { at: (d: Date) => void }).at = (d: Date) => (enqueueAt = d);

    const accounts = app.get(AccountsService);
    const assets = app.get(AssetsService);
    const broker = await accounts.createInstitution(userId, { name: 'IBKR', kind: 'broker' });
    const bank = await accounts.createInstitution(userId, { name: 'mBank', kind: 'bank' });
    ibkr = (await accounts.create(userId, { institutionId: broker.id, name: 'IBKR', type: 'investment', currencies: ['EUR', 'USD'], openingBalances: [{ currency: 'EUR', amount: '5000.00', date: '2027-06-01' }] })).id;
    mbank = (await accounts.create(userId, { institutionId: bank.id, name: 'eKonto', type: 'bank', currencies: ['PLN'], openingBalances: [{ currency: 'PLN', amount: '40000.00', date: '2027-06-01' }] })).id;
    vwce = (
      await assets.create(userId, {
        code: 'VWCE',
        name: 'Vanguard FTSE All-World',
        quoteCurrency: 'EUR',
        isin: 'IE00BK5BQT80',
        valuation: 'price_feed',
        valuationConfig: { provider: 'yahoo', symbol: 'vwce.de' },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } });
    await app.close();
  });

  const tick = async (local: string) => {
    // local Warsaw time in summer is UTC+2
    const now = new Date(`${local}:00+02:00`);
    (scheduler as unknown as { at: (d: Date) => void }).at(now);
    return (await scheduler.tick(now)).filter((e) => e.userId === userId).map((e) => e.task);
  };

  it('fetches rates without anyone asking, once a day, and gives waiting lots their PLN cost', async () => {
    // bought on Monday 7 June before any 2027 rate was stored: the PLN cost waits
    const buy = await movements.post(userId, { kind: 'buy', input: { date: '2027-06-07', accountId: ibkr, assetId: vwce, units: '10', total: '1200.00', currency: 'EUR' } }, { actor: 'user' });
    const lot = await prisma.moneyLot.findFirstOrThrow({ where: { transactionId: buy.id } });
    juneBuyLot = lot.id;
    expect(lot.costPlnMinor).toBeNull();

    // the first tick of a new user runs everything that never ran
    expect(await tick('2027-06-08T09:00')).toEqual(['recurring', 'rates', 'prices']);
    const job = await prisma.job.findFirstOrThrow({ where: { userId, type: 'money.rates' }, orderBy: { createdAt: 'desc' } });
    expect(job.payload).toEqual({ date: '2027-06-08', scheduled: 'true' });
    const first = await jobs.rates(userId, job.payload as Record<string, unknown>);
    expect(first).toMatchObject({ ecb: { latest: '2027-06-08' }, nbp: { latest: '2027-06-08' } });
    const filled = await prisma.moneyLot.findUniqueOrThrow({ where: { id: lot.id } });
    // NBP table of Friday 4 June: 1200.00 EUR x 4.25
    expect([filled.costPlnMinor, filled.costPlnRate?.toFixed(), formatDate(filled.costPlnRateDate!)]).toEqual([510_000n, '4.25', '2027-06-04']);

    // the same day: nothing new; the next evening: rates again, and nothing is stored twice
    expect(await tick('2027-06-08T20:00')).toEqual([]);
    // a run by hand in the morning does not stand in for the evening run
    await prisma.job.create({ data: { type: 'money.rates', toolId: 'money', userId, payload: { date: '2027-06-09' }, createdAt: new Date('2027-06-09T10:00:00+02:00') } });
    expect(await tick('2027-06-09T16:00')).toEqual(['recurring']);
    expect(await tick('2027-06-09T17:20')).toEqual(['rates']);
    const again = await jobs.rates(userId, { date: '2027-06-08' });
    expect(again).toMatchObject({ ecb: { stored: 0 }, nbp: { stored: 0 } });
    const stored = await prisma.moneyExchangeRate.count({ where: { source: 'nbp', fromId: 'EUR', date: parseDate('2027-06-04') } });
    expect(stored).toBe(1);

    // later days fill in for the rest of the test
    await rateFeed.sync({ since: parseDate('2027-06-01'), today: parseDate(LAST) });
    expect(requests.some((u) => u.includes('/exchangerates/tables/A/'))).toBe(true);
  });

  it('fetches prices for assets valued by the feed', async () => {
    const result = await jobs.prices(userId);
    expect(result.assets).toEqual([expect.objectContaining({ code: 'VWCE', symbol: 'vwce.de', latest: { date: '2027-08-20', price: '130.50' } })]);
    const prices = await prisma.moneyPrice.findMany({ where: { assetId: vwce, source: 'feed' }, orderBy: { date: 'asc' } });
    expect(prices.map((p) => [formatDate(p.date), p.price.toFixed()])).toEqual([
      ['2027-06-30', '121.1'],
      ['2027-07-30', '126.4'],
      ['2027-08-20', '130.5'],
    ]);
    const position = (await app.get(PositionsService).positions(userId, { asOf: parseDate('2027-08-20') })).find((p) => p.assetId === vwce)!;
    expect([position.valuedBy, position.value?.value]).toEqual(['price', '1305.00']);
  });

  it('runs a recurring movement once per date, catching up the missed ones', async () => {
    const recurring = app.get(RecurringService);
    const rent = await recurring.create(userId, {
      name: 'Rent',
      kind: 'expense',
      template: { accountId: mbank, currency: 'PLN', amount: '3500.00' },
      schedule: 'FREQ=MONTHLY;BYMONTHDAY=10',
      startDate: '2027-06-10',
      autoPost: true,
    });
    // the index fund buy is proposed: the units are filled in on approval
    const fund = await recurring.create(userId, {
      name: 'Index fund',
      kind: 'buy',
      template: { accountId: ibkr, assetId: vwce, total: '500.00', currency: 'EUR' },
      schedule: 'FREQ=MONTHLY;BYMONTHDAY=15',
      startDate: '2027-06-15',
    });
    expect([rent.nextRunAt, rent.upcoming]).toEqual(['2027-06-10', ['2027-06-10', '2027-07-10', '2027-08-10']]);
    await expect(recurring.create(userId, { name: 'x', kind: 'buy', template: { accountId: ibkr }, schedule: 'FREQ=MONTHLY', startDate: '2027-06-01', autoPost: true })).rejects.toThrow();

    const run = await recurring.runDue(userId, parseDate('2027-08-20'));
    expect(run).toEqual({ posted: 3, drafted: 3, errors: [] });
    expect(await recurring.runDue(userId, parseDate('2027-08-20'))).toEqual({ posted: 0, drafted: 0, errors: [] });

    const made = await prisma.moneyTransaction.findMany({ where: { userId, recurringRuleId: { in: [rent.id, fund.id] } }, orderBy: { date: 'asc' } });
    expect(made.filter((t) => t.status === 'posted').map((t) => formatDate(t.date))).toEqual(['2027-06-10', '2027-07-10', '2027-08-10']);
    expect(made.filter((t) => t.status === 'draft').map((t) => formatDate(t.date))).toEqual(['2027-06-15', '2027-07-15', '2027-08-15']);
    expect((await recurring.get(userId, rent.id)).nextRunAt).toBe('2027-09-10');
    // the drafts go: the test keeps its lots to the buys below
    await prisma.moneyTransaction.deleteMany({ where: { userId, status: 'draft' } });
  });

  it("imports last month's IBKR trades with no duplicates", async () => {
    // the deposit was recorded from the bank; one July buy was typed in by hand before the statement came
    await movements.post(userId, { kind: 'transfer', input: { date: '2027-07-02', fromAccountId: mbank, fromCurrency: 'PLN', amountOut: '8600.00', toAccountId: ibkr, toCurrency: 'EUR', amountIn: '2000.00' } }, { actor: 'user' });
    await movements.post(userId, { kind: 'buy', input: { date: '2027-07-19', accountId: ibkr, assetId: vwce, units: '5', total: '606.75', currency: 'EUR' } }, { actor: 'user' });

    const july = await imports.upload(userId, { buffer: fixture('ibkr-2027-07.csv'), originalname: 'ibkr-2027-07.csv' }, { profile: 'ibkr', accountId: ibkr });
    expect(july.counts).toMatchObject({ ready: 6, matched: 2 });
    const rows = await imports.rows(userId, july.id, { status: 'matched' });
    expect(rows.items.map((r) => (r.proposal as { kind: string }).kind).sort()).toEqual(['buy', 'transfer']);
    expect(await imports.commit(userId, july.id)).toMatchObject({ imported: 6 });

    // the statement for July and August: only August is new
    const both = await imports.upload(userId, { buffer: fixture('ibkr-2027-07-08.csv'), originalname: 'ibkr-2027-07-08.csv' }, { profile: 'ibkr', accountId: ibkr });
    expect(both.counts).toMatchObject({ ready: 2, duplicate: 6, matched: 2 });
    expect(await imports.commit(userId, both.id)).toMatchObject({ imported: 2 });

    const buys = await prisma.moneyTransaction.findMany({ where: { userId, kind: 'buy', status: 'posted', assetId: vwce }, orderBy: { date: 'asc' } });
    expect(buys.map((b) => formatDate(b.date))).toEqual(['2027-06-07', '2027-07-05', '2027-07-19']);
    const vt = await prisma.moneyAsset.findFirstOrThrow({ where: { commodity: { userId, code: 'VT' } } });
    expect(vt.isin).toBe('US9220427424');
    const position = (await app.get(PositionsService).positions(userId, { accountId: ibkr, asOf: parseDate(LAST) })).find((p) => p.assetId === vwce)!;
    expect(position.units).toBe('17');
  });

  it('builds the tax report from the lots', async () => {
    const report = await app.get(TaxService).report(userId, 2027);
    expect(report.complete).toBe(true);
    expect(report.accounts.map((a) => a.name)).toEqual(['IBKR']);

    // the August sale of 8 took them from the June lot (first in, first out)
    expect(report.sales).toHaveLength(1);
    const [sale] = report.sales;
    expect([sale.date, sale.units, sale.proceeds.value, sale.rateDate, sale.rate]).toEqual(['2027-08-16', '8', '1038.75', '2027-08-13', '4.35']);
    // 1038.75 EUR x 4.35 = 4518.56; cost 8/10 of the lot's 5100.00 = 4080.00
    expect([sale.proceedsPln?.value, sale.costPln?.value, sale.gainPln?.value]).toEqual(['4518.56', '4080.00', '438.56']);
    expect(sale.lots).toEqual([
      expect.objectContaining({ lotId: juneBuyLot, acquiredAt: '2027-06-07', units: '8', cost: expect.objectContaining({ value: '960.00' }), costPln: expect.objectContaining({ value: '4080.00' }), rate: '4.25', rateDate: '2027-06-04' }),
    ]);
    const lot = (await app.get(PositionsService).lotList(userId, { accountId: ibkr, assetId: vwce })).find((l) => l.id === juneBuyLot)!;
    expect([lot.costPln?.value, lot.remainingUnits]).toEqual(['5100.00', '2']);

    // dividends and interest: 12.30 USD (1.85 withheld) at 3.85, 0.42 EUR at 4.30, 12.60 USD (1.89 withheld) at 3.90
    expect(report.income.map((i) => [i.date, i.category, i.grossPln?.value, i.withheldPln?.value, i.taxPln?.value, i.creditPln?.value])).toEqual([
      ['2027-07-03', 'Interest', '1.81', '0.00', '0.34', '0.00'],
      ['2027-07-15', 'Dividends', '47.36', '7.12', '9.00', '7.12'],
      ['2027-08-16', 'Dividends', '49.14', '7.37', '9.34', '7.37'],
    ]);
    expect(Object.fromEntries(Object.entries(report.totals).map(([k, v]) => [k, v.value]))).toEqual({
      revenue: '4518.56',
      costs: '4080.00',
      income: '438.56',
      base: '439.00',
      tax: '83.00',
      incomeGross: '98.31',
      incomeTax: '18.68',
      incomeCredit: '14.49',
      incomeDue: '4.00',
    });
  });
});
