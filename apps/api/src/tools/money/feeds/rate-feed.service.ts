import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@platform/db/prisma.service';
import { EnvironmentVariables } from '@platform/config/env.validation';
import { addDays, formatDate, parseDate, todayIn } from '../core/dates';
import { dateChunks, parseEcbXml, parseNbpTables, type FeedRate } from '../core/feeds';
import { costShare } from '../core/lots';
import { RatesService } from '../rates/rates.service';
import { CommoditiesService } from '../reference/commodities.service';
import { MoneyHttp } from './http.service';

/** NBP publishes table A from 2 January 2002. */
const NBP_FIRST_DAY = '2002-01-02';
/** Days the ECB 90-day file reaches back, with a margin. */
const ECB_SHORT_FILE_DAYS = 85;

export interface FeedOutcome {
  fetched: number;
  stored: number;
  latest: string | null;
  error?: string;
}

export interface RateSyncResult {
  ecb: FeedOutcome;
  nbp: FeedOutcome;
  lotsFilled: number;
}

/**
 * The daily rates job: fetches what the rate table is missing from the ECB
 * (euro reference rates) and the NBP (table A, the Polish tax rates), from
 * `since` to today, and stores them once. Then fills the PLN cost of lots
 * opened before their NBP rate arrived.
 */
@Injectable()
export class RateFeedService {
  private readonly logger = new Logger(RateFeedService.name);
  private readonly timeZone: string;
  private readonly ecbBase: string;
  private readonly nbpBase: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly http: MoneyHttp,
    private readonly commodities: CommoditiesService,
    private readonly rates: RatesService,
    config: ConfigService<EnvironmentVariables>,
  ) {
    this.timeZone = config.get('MONEY_TIMEZONE', { infer: true }) ?? 'Europe/Warsaw';
    this.ecbBase = (config.get('MONEY_ECB_BASE_URL', { infer: true }) ?? 'https://www.ecb.europa.eu/stats/eurofxref').replace(/\/$/, '');
    this.nbpBase = (config.get('MONEY_NBP_BASE_URL', { infer: true }) ?? 'https://api.nbp.pl/api').replace(/\/$/, '');
  }

  /** The first day any of the user's money moved, the feeds' starting point. */
  async firstDay(userId: string): Promise<Date | null> {
    const first = await this.prisma.moneyTransaction.findFirst({ where: { userId, status: 'posted' }, orderBy: { date: 'asc' }, select: { date: true } });
    return first?.date ?? null;
  }

  async sync(opts: { since?: Date; today?: Date } = {}): Promise<RateSyncResult> {
    const today = opts.today ?? todayIn(this.timeZone);
    const since = addDays(opts.since && opts.since < today ? opts.since : addDays(today, -30), -7);
    const ecb = await this.syncEcb(since, today).catch((error: unknown) => this.failed('ecb', error));
    const nbp = await this.syncNbp(since, today).catch((error: unknown) => this.failed('nbp', error));
    const lotsFilled = await this.fillLotCosts();
    return { ecb, nbp, lotsFilled };
  }

  private failed(source: string, error: unknown): FeedOutcome {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.warn(`${source} rates: ${message}`);
    return { fetched: 0, stored: 0, latest: null, error: message };
  }

  private async bounds(source: 'ecb' | 'nbp') {
    const agg = await this.prisma.moneyExchangeRate.aggregate({ where: { source }, _min: { date: true }, _max: { date: true } });
    return { first: agg._min.date, last: agg._max.date };
  }

  private async store(source: 'ecb' | 'nbp', rows: FeedRate[], since: Date, today: Date): Promise<FeedOutcome> {
    const known = new Set((await this.commodities.list()).map((c) => c.code));
    const [from, to] = [formatDate(since), formatDate(today)];
    const keep = rows.filter((r) => known.has(r.from) && known.has(r.to) && r.date >= from && r.date <= to);
    let stored = 0;
    for (let i = 0; i < keep.length; i += 2000) {
      const result = await this.prisma.moneyExchangeRate.createMany({
        data: keep.slice(i, i + 2000).map((r) => ({ source, date: parseDate(r.date), fromId: r.from, toId: r.to, rate: r.rate })),
        skipDuplicates: true,
      });
      stored += result.count;
    }
    const latest = keep.reduce<string | null>((max, r) => (max === null || r.date > max ? r.date : max), null);
    return { fetched: rows.length, stored, latest };
  }

  private async syncEcb(since: Date, today: Date): Promise<FeedOutcome> {
    const { first, last } = await this.bounds('ecb');
    const needsHistory = !first || !last || first > addDays(since, 7) || last < addDays(today, -ECB_SHORT_FILE_DAYS);
    const url = `${this.ecbBase}/${needsHistory ? 'eurofxref-hist.xml' : 'eurofxref-hist-90d.xml'}`;
    const res = await this.http.get(url);
    if (res.status !== 200) throw new Error(`ECB answered ${res.status} for ${url}`);
    const rows = parseEcbXml(res.text);
    if (rows.length === 0) throw new Error('the ECB file held no rates');
    return this.store('ecb', rows, since, today);
  }

  private async syncNbp(since: Date, today: Date): Promise<FeedOutcome> {
    const { first, last } = await this.bounds('nbp');
    const start = formatDate(since) < NBP_FIRST_DAY ? NBP_FIRST_DAY : formatDate(since);
    const spans: [string, string][] = [];
    if (!first || !last) spans.push([start, formatDate(today)]);
    else {
      if (formatDate(first) > start) spans.push([start, formatDate(addDays(first, -1))]);
      if (last < today) spans.push([formatDate(addDays(last, 1)), formatDate(today)]);
    }
    const rows: FeedRate[] = [];
    for (const [from, to] of spans) {
      for (const [a, b] of dateChunks(from, to, 90)) {
        const url = `${this.nbpBase}/exchangerates/tables/A/${a}/${b}/?format=json`;
        const res = await this.http.get(url);
        if (res.status === 404) continue; // no table in these days (holidays)
        if (res.status !== 200) throw new Error(`NBP answered ${res.status} for ${url}`);
        rows.push(...parseNbpTables(res.text));
      }
    }
    if (spans.length === 0) return { fetched: 0, stored: 0, latest: last ? formatDate(last) : null };
    const outcome = await this.store('nbp', rows, since, today);
    return { ...outcome, latest: outcome.latest ?? (last ? formatDate(last) : null) };
  }

  /**
   * Lots whose PLN cost waited for the NBP rate of the business day before
   * they were bought; a moved lot takes its share of its parent's.
   */
  async fillLotCosts(userId?: string): Promise<number> {
    const lots = await this.prisma.moneyLot.findMany({
      where: { costPlnMinor: null, reversedAt: null, ...(userId ? { account: { userId } } : {}) },
      orderBy: [{ acquiredAt: 'asc' }, { createdAt: 'asc' }],
      include: { parentLot: true },
    });
    let filled = 0;
    for (const lot of lots.filter((l) => !l.parentLotId)) {
      const decimals = await this.commodities.decimalsOf(lot.costCurrencyId);
      const pln = await this.rates.toPlnForTax(this.prisma, lot.costMinor, lot.costCurrencyId, decimals, lot.acquiredAt);
      if (!pln) continue;
      await this.prisma.moneyLot.update({ where: { id: lot.id }, data: { costPlnMinor: pln.minor, costPlnRate: pln.rate, costPlnRateDate: pln.rateDate } });
      filled++;
    }
    for (const lot of lots.filter((l) => l.parentLotId)) {
      const parent = await this.prisma.moneyLot.findUnique({ where: { id: lot.parentLotId! } });
      if (!parent || parent.costPlnMinor === null || parent.costMinor === 0n) continue;
      await this.prisma.moneyLot.update({
        where: { id: lot.id },
        data: { costPlnMinor: costShare(parent.costPlnMinor, lot.costMinor, parent.costMinor), costPlnRate: parent.costPlnRate, costPlnRateDate: parent.costPlnRateDate },
      });
      filled++;
    }
    return filled;
  }
}
