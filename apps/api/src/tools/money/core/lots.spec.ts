import { bondValue, BondConfigError, parseBondConfig, unitsValue } from './bonds';
import { parseDate } from './dates';
import { consumeLots, costShare, LotError, splitUnits, type OpenLot } from './lots';
import { parseQuantity } from './quantity';

const u = parseQuantity;
const lot = (id: string, acquiredAt: string, units: string, cost: bigint, remaining = units, remainingCost = cost): OpenLot => ({
  id,
  acquiredAt,
  units: u(units),
  remainingUnits: u(remaining),
  remainingCostMinor: remainingCost,
  costCurrency: 'EUR',
});

describe('lots', () => {
  // VWCE on IBKR: three buys, 71 units in total
  const lots = [
    lot('c', '2026-03-10', '21', 266_700n),
    lot('a', '2025-06-02', '30', 345_000n),
    lot('b', '2025-11-14', '20', 241_200n),
  ];

  it('takes the oldest lots first (FIFO) with their exact cost', () => {
    const takes = consumeLots(lots, u('35'), 'fifo');
    expect(takes).toEqual([
      { lotId: 'a', units: u('30'), costMinor: 345_000n, costCurrency: 'EUR' },
      { lotId: 'b', units: u('5'), costMinor: 60_300n, costCurrency: 'EUR' },
    ]);
  });

  it('gives up a lot taken in full at exactly its remaining cost', () => {
    // 3 units cost 100.00; taking 1, 1, then the last 1 sums to 100.00 exactly
    expect(costShare(10_000n, u('1'), u('3'))).toBe(3_333n);
    expect(costShare(10_000n - 3_333n, u('1'), u('2'))).toBe(3_334n);
    expect(costShare(10_000n - 3_333n - 3_334n, u('1'), u('1'))).toBe(3_333n);
  });

  it('takes the same fraction of every lot under average cost', () => {
    const takes = consumeLots(lots, u('7.1'), 'average');
    expect(takes.map((t) => [t.lotId, t.units])).toEqual([
      ['c', u('2.1')],
      ['a', u('3')],
      ['b', u('2')],
    ]);
    expect(takes.reduce((s, t) => s + t.units, 0n)).toBe(u('7.1'));
    // a tenth of each lot's cost
    expect(takes.map((t) => t.costMinor)).toEqual([26_670n, 34_500n, 24_120n]);
  });

  it('refuses to sell more than the lots hold', () => {
    expect(() => consumeLots(lots, u('71.0000000001'), 'fifo')).toThrow(LotError);
    expect(() => consumeLots(lots, 0n, 'fifo')).toThrow(LotError);
  });

  it('splits units, not cost', () => {
    expect(splitUnits(u('71'), 1n, 3n)).toBe(u('213'));
    expect(splitUnits(u('10'), 3n, 1n)).toBe(u('3.3333333333'));
  });
});

describe('EDO bond formula', () => {
  const config = parseBondConfig({
    nominal: '100.00',
    termYears: 10,
    series: [{ from: '2025-08-01', firstYearRate: '5.60', margin: '2.00' }],
    inflation: { '2026-06': '3.1', '2028-06': '-0.5' },
  });
  const bought = parseDate('2025-08-10');
  const at = (date: string) => bondValue(config, bought, parseDate(date), 2);

  it('starts at the nominal value and accrues the first-year rate day by day', () => {
    expect(at('2025-08-10').minor).toBe(10_000n);
    // 100.00 x 5.60% x 184/365 = 2.82
    expect(at('2026-02-10').minor).toBe(10_282n);
  });

  it('capitalises each year and then pays margin plus inflation of two months before', () => {
    // on the anniversary the second year has begun, with nothing accrued yet
    expect(at('2026-08-10')).toMatchObject({ minor: 10_560n, currentRate: '5.10' });
    // year two: 2.00 + 3.1 = 5.10%; 105.60 x 5.10% x 184/365 = 2.71
    expect(at('2027-02-10')).toMatchObject({ minor: 10_831n, currentRate: '5.10', estimated: false });
    expect(at('2027-08-10').minor).toBe(10_560n + 539n);
  });

  it('uses the latest inflation known when the month it needs is missing, and says so', () => {
    expect(at('2028-02-10')).toMatchObject({ currentRate: '5.10', estimated: true });
  });

  it('never goes below the margin in deflation', () => {
    // year four starts 2028-08-10 and needs 2028-06 = -0.5: the rate is the margin alone
    expect(at('2029-02-10').currentRate).toBe('2.00');
  });

  it('stops growing at maturity', () => {
    const end = at('2035-08-10');
    expect(end.matured).toBe(true);
    expect(at('2036-08-10').minor).toBe(end.minor);
  });

  it('values several bonds', () => {
    expect(unitsValue(10_282n, u('25'))).toBe(257_050n);
  });

  it('checks the config', () => {
    expect(() => parseBondConfig({ nominal: '100', termYears: 10, series: [] })).toThrow(BondConfigError);
    expect(() => parseBondConfig({ nominal: 'x', termYears: 10, series: [{ from: '2025-01-01', firstYearRate: '1', margin: '1' }] })).toThrow(
      BondConfigError,
    );
  });
});
