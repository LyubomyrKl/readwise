import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@platform/db/prisma.service';
import { EnvironmentVariables } from '@platform/config/env.validation';
import { parseDate } from '../core/dates';
import { monthEndPrices, parseYahooChart, type FeedPrice } from '../core/feeds';
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
 * close from Yahoo Finance (symbol as Yahoo writes it, e.g. VWCE.DE); the first
 * time, also the month-end closes of ten years of history so values over time
 * have prices. A quote in another currency than the asset's is refused. Prices
 * land in the one price table with source "feed"; a manual price of the same
 * day stays beside it.
 */
@Injectable()
export class PriceFeedService {
  private readonly base: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly http: MoneyHttp,
    config: ConfigService<EnvironmentVariables>,
  ) {
    this.base = (config.get('MONEY_PRICE_FEED_BASE_URL', { infer: true }) ?? 'https://query1.finance.yahoo.com').replace(/\/$/, '');
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
        const chart = async (range: string) => {
          const res = await this.http.get(`${this.base}/v8/finance/chart/${encodeURIComponent(symbol.toUpperCase())}?range=${range}&interval=1d`);
          if (res.status !== 200) throw new Error(`Yahoo answered ${res.status} for ${symbol}`);
          const parsed = parseYahooChart(res.text);
          if (!parsed) throw new Error(`Yahoo has no price for ${symbol}`);
          if (parsed.currency !== asset.quoteCurrencyId) throw new Error(`Yahoo quotes ${symbol} in ${parsed.currency}, the asset in ${asset.quoteCurrencyId}`);
          return parsed.prices;
        };
        const prices: FeedPrice[] = [];
        const hasFeedPrices = (await this.prisma.moneyPrice.count({ where: { assetId: asset.commodityId, source: 'feed' } })) > 0;
        if (!hasFeedPrices) prices.push(...monthEndPrices(await chart('10y')));
        const recent = await chart('5d');
        const quote = recent[recent.length - 1];
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
