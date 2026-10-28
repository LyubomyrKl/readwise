import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@platform/db/prisma.service';
import { EnvironmentVariables } from '@platform/config/env.validation';
import { parseDate } from '../core/dates';
import { monthEndPrices, parseStooqHistory, parseStooqQuote, type FeedPrice } from '../core/feeds';
import { MoneyHttp } from './http.service';

export interface PriceFeedOutcome {
  assetId: string;
  code: string;
  symbol: string;
  stored: number;
  latest: FeedPrice | null;
  error?: string;
}

/**
 * The evening price job: for each asset valued by the price feed, the latest
 * close from Stooq; the first time, also the month-end closes of its history
 * so values over time have prices. Prices land in the one price table with
 * source "feed"; a manual price of the same day stays beside it.
 */
@Injectable()
export class PriceFeedService {
  private readonly base: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly http: MoneyHttp,
    config: ConfigService<EnvironmentVariables>,
  ) {
    this.base = (config.get('MONEY_STOOQ_BASE_URL', { infer: true }) ?? 'https://stooq.com').replace(/\/$/, '');
  }

  /** Assets of the user valued by the feed, with the symbol they are fetched under. */
  async feedAssets(userId: string) {
    const assets = await this.prisma.moneyAsset.findMany({
      where: { valuation: 'price_feed', archivedAt: null, commodity: { userId } },
      include: { commodity: true },
      orderBy: { commodity: { code: 'asc' } },
    });
    return assets
      .map((a) => ({ asset: a, symbol: ((a.valuationConfig as { symbol?: string } | null)?.symbol ?? a.ticker ?? '').trim().toLowerCase() }))
      .filter((a) => a.symbol);
  }

  async sync(userId: string): Promise<PriceFeedOutcome[]> {
    const out: PriceFeedOutcome[] = [];
    for (const { asset, symbol } of await this.feedAssets(userId)) {
      const outcome: PriceFeedOutcome = { assetId: asset.commodityId, code: asset.commodity.code, symbol, stored: 0, latest: null };
      try {
        const prices: FeedPrice[] = [];
        const hasFeedPrices = (await this.prisma.moneyPrice.count({ where: { assetId: asset.commodityId, source: 'feed' } })) > 0;
        if (!hasFeedPrices) {
          const res = await this.http.get(`${this.base}/q/d/l/?s=${encodeURIComponent(symbol)}&i=d`);
          if (res.status === 200) prices.push(...monthEndPrices(parseStooqHistory(res.text)));
        }
        const res = await this.http.get(`${this.base}/q/l/?s=${encodeURIComponent(symbol)}&f=sd2t2ohlcv&h&e=csv`);
        if (res.status !== 200) throw new Error(`Stooq answered ${res.status}`);
        const quote = parseStooqQuote(res.text);
        if (!quote) throw new Error(/limit/i.test(res.text) ? 'Stooq: daily limit reached' : `Stooq has no price for ${symbol}`);
        prices.push(quote);
        for (const p of prices) {
          await this.prisma.moneyPrice.upsert({
            where: { assetId_date_source: { assetId: asset.commodityId, date: parseDate(p.date), source: 'feed' } },
            create: { assetId: asset.commodityId, date: parseDate(p.date), price: p.price, quoteCurrencyId: asset.quoteCurrencyId, source: 'feed' },
            update: { price: p.price },
          });
          outcome.stored++;
        }
        outcome.latest = quote;
      } catch (error) {
        outcome.error = error instanceof Error ? error.message : String(error);
      }
      out.push(outcome);
    }
    return out;
  }
}
