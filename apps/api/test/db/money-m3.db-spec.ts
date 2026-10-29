import type { TestingModule } from '@nestjs/testing';
import type { PrismaService } from '@platform/db/prisma.service';
import { AccountsService } from '@tools/money/accounts/accounts.service';
import { DraftsService } from '@tools/money/drafts/drafts.service';
import { AssetsService } from '@tools/money/investments/assets.service';
import { PositionsService } from '@tools/money/investments/positions.service';
import { PricesService } from '@tools/money/investments/prices.service';
import { MovementsService } from '@tools/money/movements/movements.service';
import { TransactionsService } from '@tools/money/transactions/transactions.service';
import { ViewsService } from '@tools/money/views/views.service';
import { moneyHarness } from './money-harness';

/** M3 done-when: VWCE shows 71 units on IBKR with the right cost; a test sale consumes the oldest lots first. */
describe('M3 investments', () => {
  let app: TestingModule;
  let prisma: PrismaService;
  let accounts: AccountsService;
  let assets: AssetsService;
  let movements: MovementsService;
  let positions: PositionsService;
  let prices: PricesService;
  let transactions: TransactionsService;
  let userId: string;
  let ibkr: string;
  let xtb: string;
  let mbank: string;
  let bonds: string;
  let vwce: string;
  let edo: string;
  const buys: string[] = [];

  const post = (kind: Parameters<MovementsService['post']>[1]['kind'], input: Record<string, unknown>) =>
    movements.post(userId, { kind, input }, { actor: 'user' });
  const position = async (accountId: string, assetId: string) =>
    (await positions.positions(userId, { accountId })).find((p) => p.assetId === assetId);
  const lots = (accountId: string) => positions.lotList(userId, { accountId, assetId: vwce });

  beforeAll(async () => {
    const h = await moneyHarness();
    app = h.app;
    prisma = h.prisma;
    userId = await h.newUser('m3');
    accounts = app.get(AccountsService);
    assets = app.get(AssetsService);
    movements = app.get(MovementsService);
    positions = app.get(PositionsService);
    prices = app.get(PricesService);
    transactions = app.get(TransactionsService);

    const broker = await accounts.createInstitution(userId, { name: 'IBKR', kind: 'broker' });
    const xtbInst = await accounts.createInstitution(userId, { name: 'XTB', kind: 'broker' });
    const bank = await accounts.createInstitution(userId, { name: 'mBank', kind: 'bank' });
    const registry = await accounts.createInstitution(userId, { name: 'Treasury bonds', kind: 'bond_registry' });
    ibkr = (
      await accounts.create(userId, {
        institutionId: broker.id,
        name: 'IBKR',
        type: 'investment',
        currencies: ['EUR'],
        openingBalances: [{ currency: 'EUR', amount: '10000.00', date: '2025-01-01' }],
      })
    ).id;
    xtb = (
      await accounts.create(userId, {
        institutionId: xtbInst.id,
        name: 'XTB IKE',
        type: 'investment',
        taxWrapper: 'tax_advantaged',
        costBasisMethod: 'average',
        currencies: ['PLN'],
        openingBalances: [{ currency: 'PLN', amount: '20000.00', date: '2025-01-01' }],
      })
    ).id;
    mbank = (
      await accounts.create(userId, {
        institutionId: bank.id,
        name: 'eKonto',
        type: 'bank',
        currencies: ['PLN'],
        openingBalances: [{ currency: 'PLN', amount: '5000.00', date: '2025-01-01' }],
      })
    ).id;
    bonds = (await accounts.create(userId, { institutionId: registry.id, name: 'Bonds', type: 'bonds', currencies: ['PLN'] })).id;
    vwce = (await assets.create(userId, { code: 'VWCE', name: 'Vanguard FTSE All-World', quoteCurrency: 'EUR', ticker: 'VWCE.DE' })).id;
    edo = (
      await assets.create(userId, {
        code: 'EDO',
        name: 'EDO 10-year inflation-linked bonds',
        quoteCurrency: 'PLN',
        unitName: 'bonds of 100 PLN',
        valuation: 'bond_formula',
        valuationConfig: {
          nominal: '100.00',
          termYears: 10,
          series: [{ from: '2025-08-01', firstYearRate: '5.60', margin: '2.00' }],
          inflation: { '2026-06': '3.1' },
        },
      })
    ).id;
    // the NBP table of Friday 2025-05-30 serves a buy on Monday 2025-06-02
    // rates are shared by every user: upsert so the suite can run again
    const may30 = new Date('2025-05-30');
    await prisma.moneyExchangeRate.upsert({
      where: { source_date_fromId_toId: { source: 'nbp', date: may30, fromId: 'EUR', toId: 'PLN' } },
      create: { date: may30, fromId: 'EUR', toId: 'PLN', rate: '4.2000', source: 'nbp' },
      update: { rate: '4.2000' },
    });
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } });
    await app.close();
  });

  it('holds 71 VWCE on IBKR at the cost of the three buys', async () => {
    for (const [date, units, total] of [
      ['2025-06-02', '30', '3450.00'],
      ['2025-11-14', '20', '2412.00'],
      ['2026-03-10', '21', '2667.00'],
    ]) {
      buys.push((await post('buy', { date, accountId: ibkr, assetId: vwce, units, total, currency: 'EUR' })).id);
    }
    const p = (await position(ibkr, vwce))!;
    expect(p.units).toBe('71');
    expect(p.cost).toEqual([{ currency: 'EUR', minor: '852900', value: '8529.00' }]);
    expect(p.averageCost).toBe('120.1268');
    expect(p.lots).toBe(3);
    // the cash went down by the same, the units did not come from nowhere
    const account = await accounts.get(userId, ibkr);
    expect(account.balances.find((b) => b.commodityId === 'EUR')?.balance?.value).toBe('1471.00');
  });

  it('works out the cost in PLN at the NBP rate of the business day before', async () => {
    const [first, second] = await lots(ibkr);
    expect(first).toMatchObject({ costPln: { value: '14490.00' }, costPlnRateDate: '2025-05-30' });
    // the only NBP table stored before 2025-11-14 is May's: too old to be the day before, so it waits for the rates job
    expect(second.costPln).toBeNull();
  });

  it('sells the oldest lots first', async () => {
    const sale = await post('sell', { date: '2026-10-01', accountId: ibkr, assetId: vwce, units: '35', proceeds: '4480.00', currency: 'EUR' });
    const after = await lots(ibkr);
    expect(after.map((l) => [l.acquiredAt, l.remainingUnits, l.remainingCost.value])).toEqual([
      ['2025-06-02', '0', '0.00'],
      ['2025-11-14', '15', '1809.00'],
      ['2026-03-10', '21', '2667.00'],
    ]);
    const consumed = await prisma.moneyLotConsumption.findMany({ where: { transactionId: sale.id }, orderBy: { costAllocatedMinor: 'desc' } });
    expect(consumed.map((c) => c.costAllocatedMinor)).toEqual([345_000n, 60_300n]);
    const p = (await position(ibkr, vwce))!;
    expect(p.units).toBe('36');
    expect(p.cost[0].value).toBe('4476.00');

    // a reversal puts the units back into the same lots
    await transactions.reverse(userId, sale.id, {});
    expect((await lots(ibkr)).map((l) => l.remainingUnits)).toEqual(['30', '20', '21']);
    expect((await position(ibkr, vwce))!.units).toBe('71');
    await post('sell', { date: '2026-10-01', accountId: ibkr, assetId: vwce, units: '35', proceeds: '4480.00', currency: 'EUR' });
  });

  it('does not let a back-dated sale take a lot bought after it', async () => {
    // only the first lot (30 units) existed on 2025-07-01
    await expect(
      post('sell', { date: '2025-07-01', accountId: ibkr, assetId: vwce, units: '31', proceeds: '1.00', currency: 'EUR' }),
    ).rejects.toThrow(/a later sale or move of this asset \(2026-10-01\)/);
  });

  it('refuses to sell more than is held, and to reverse a buy whose units were sold', async () => {
    await expect(
      post('sell', { date: '2026-10-02', accountId: ibkr, assetId: vwce, units: '36.5', proceeds: '1.00', currency: 'EUR' }),
    ).rejects.toThrow(/only 36 units are held/);
    await expect(transactions.reverse(userId, buys[0], {})).rejects.toThrow(/sold or moved/);
  });

  it('values the holding at the latest price and shows the gain', async () => {
    await prices.record(userId, { assetId: vwce, date: '2026-09-30', price: '120.00' });
    await prices.record(userId, { assetId: vwce, date: '2026-10-27', price: '130.50' });
    expect((await prices.list(userId, vwce)).map((p) => p.price)).toEqual(['130.5', '120']);
    // without an asset there is no list (an empty filter would match every user's prices)
    await expect(prices.list(userId, undefined)).rejects.toThrow('assetId: required');
    const p = (await position(ibkr, vwce))!;
    expect(p.price).toMatchObject({ price: '130.5', date: '2026-10-27' });
    expect(p.value?.value).toBe('4698.00');
    expect(p.gain?.value).toBe('222.00');
    expect(p.gainPercent).toBe('5.0');
    const september = (await positions.positions(userId, { accountId: ibkr, asOf: new Date('2026-09-30') })).find((x) => x.assetId === vwce)!;
    expect(september.units).toBe('71');
    expect(september.value?.value).toBe('8520.00');
  });

  it('takes the same share of every lot under average cost (XTB IKE)', async () => {
    await post('buy', { date: '2026-01-05', accountId: xtb, assetId: vwce, units: '10', total: '4800.00', currency: 'PLN' });
    await post('buy', { date: '2026-02-05', accountId: xtb, assetId: vwce, units: '10', total: '5200.00', currency: 'PLN' });
    await post('sell', { date: '2026-03-05', accountId: xtb, assetId: vwce, units: '5', proceeds: '2600.00', currency: 'PLN' });
    expect((await lots(xtb)).map((l) => [l.remainingUnits, l.remainingCost.value])).toEqual([
      ['7.5', '3600.00'],
      ['7.5', '3900.00'],
    ]);
  });

  it('moves units with their cost and dates, and moves them back on reversal', async () => {
    const move = await post('unit_move', { date: '2026-10-05', fromAccountId: ibkr, toAccountId: xtb, assetId: vwce, units: '20' });
    const moved = (await lots(xtb)).filter((l) => l.parentLotId);
    expect(moved.map((l) => [l.acquiredAt, l.units, l.cost.value])).toEqual([
      ['2025-11-14', '15', '1809.00'],
      ['2026-03-10', '5', '635.00'],
    ]);
    expect((await position(ibkr, vwce))!.units).toBe('16');
    await transactions.reverse(userId, move.id, {});
    expect((await position(ibkr, vwce))!.units).toBe('36');
    expect((await lots(xtb)).filter((l) => l.parentLotId)).toEqual([]);
  });

  it('splits units in every account without changing cost, and undoes it', async () => {
    const split = await post('split', { date: '2026-10-10', assetId: vwce, ratioFrom: '1', ratioTo: '3' });
    expect((await position(ibkr, vwce))!.units).toBe('108');
    expect((await position(ibkr, vwce))!.cost[0].value).toBe('4476.00');
    expect((await position(xtb, vwce))!.units).toBe('45');
    await transactions.reverse(userId, split.id, {});
    expect((await position(ibkr, vwce))!.units).toBe('36');
    expect((await position(xtb, vwce))!.units).toBe('15');
  });

  it('posts an approved split draft itself, and keeps a split and the trades around it in order', async () => {
    const drafts = app.get(DraftsService);
    const proposal = await drafts.create(userId, { kind: 'split', input: { date: '2026-10-11', assetId: vwce, ratioFrom: '1', ratioTo: '2' } }, { actor: 'user' });
    const split = await drafts.approve(userId, proposal.id, undefined);
    expect([split.id, split.status]).toEqual([proposal.id, 'posted']);
    expect(await prisma.moneyTransaction.count({ where: { userId, status: 'draft' } })).toBe(0);
    expect((await position(ibkr, vwce))!.units).toBe('72');

    // a buy from before the split is in the old units
    await expect(transactions.reverse(userId, buys[2], {})).rejects.toThrow(/split since \(2026-10-11\); reverse the split first/);
    // a sale after it takes the new units: the split cannot be undone under it, nor dated before it
    const sale = await post('sell', { date: '2026-10-12', accountId: ibkr, assetId: vwce, units: '2', proceeds: '100.00', currency: 'EUR' });
    await expect(transactions.reverse(userId, split.id, {})).rejects.toThrow(/after the split; reverse those first/);
    await expect(post('split', { date: '2026-10-11', assetId: vwce, ratioFrom: '2', ratioTo: '1' })).rejects.toThrow(/after the split date/);

    await transactions.reverse(userId, sale.id, {});
    await transactions.reverse(userId, split.id, {});
    expect((await position(ibkr, vwce))!.units).toBe('36');
    expect((await position(xtb, vwce))!.units).toBe('15');
  });

  it('books a dividend gross with the tax withheld', async () => {
    const tx = await post('investment_income', {
      date: '2026-10-15',
      accountId: ibkr,
      currency: 'EUR',
      amount: '8.50',
      withholding: '1.50',
      assetId: vwce,
    });
    const shown = await transactions.get(userId, tx.id);
    expect(shown.category?.name).toBe('Dividends');
    expect(shown.entries.map((e) => [e.systemRole ?? e.accountName, e.amount?.value, e.categoryName])).toEqual([
      ['IBKR', '8.50', null],
      ['expense', '1.50', 'Taxes'],
      ['income', '-10.00', 'Dividends'],
    ]);
  });

  it('values EDO bonds with the bond formula', async () => {
    await post('buy', {
      date: '2025-08-10',
      accountId: bonds,
      assetId: edo,
      units: '25',
      total: '2500.00',
      currency: 'PLN',
      paidFromAccountId: mbank,
    });
    const p = (await positions.positions(userId, { accountId: bonds, asOf: new Date('2026-02-10') })).find((x) => x.assetId === edo)!;
    expect(p.valuedBy).toBe('bond_formula');
    expect(p.value?.value).toBe('2570.50');
    expect(p.gain?.value).toBe('70.50');
  });

  it('records units held before tracking without moving cash', async () => {
    const before = await accounts.get(userId, mbank);
    await post('buy', { date: '2024-12-31', accountId: bonds, assetId: edo, units: '10', total: '1000.00', currency: 'PLN', heldBefore: true });
    const after = await accounts.get(userId, mbank);
    expect(after.balances).toEqual(before.balances);
    expect((await position(bonds, edo))!.units).toBe('35');
  });

  it('shows a holding without a price at cost in each currency, with the units bought for each', async () => {
    const gold = (await assets.create(userId, { code: 'GOLD', name: 'Gold coins', quoteCurrency: 'EUR' })).id;
    await post('buy', { date: '2026-10-20', accountId: ibkr, assetId: gold, units: '2', total: '200.00', currency: 'EUR' });
    await post('buy', { date: '2026-10-20', accountId: xtb, assetId: gold, units: '3', total: '1300.00', currency: 'PLN' });
    await post('unit_move', { date: '2026-10-21', fromAccountId: xtb, toAccountId: ibkr, assetId: gold, units: '3' });
    const nw = await app.get(ViewsService).netWorth(userId, { asOf: new Date('2026-10-21') });
    // in the order of their value in the base currency, which depends on the stored rates
    const items = nw.accounts.find((a) => a.accountId === ibkr)!.items.filter((i) => i.code === 'GOLD');
    items.sort((a, b) => a.native!.currency.localeCompare(b.native!.currency));
    expect(items.map((i) => [i.units, i.native?.value, i.native?.currency, i.valuedBy])).toEqual([
      ['2', '200.00', 'EUR', 'cost'],
      ['3', '1300.00', 'PLN', 'cost'],
    ]);
  });
});
