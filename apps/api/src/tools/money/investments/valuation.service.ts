import { Injectable } from '@nestjs/common';
import type { MoneyAsset, MoneyCommodity } from '@prisma/client';
import { PrismaService } from '@platform/db/prisma.service';
import type { Db } from '../common/db';
import { bondValue, parseBondConfig, unitsValue } from '../core/bonds';
import { divRound, pow10, toFraction } from '../core/decimal';
import { formatDate } from '../core/dates';
import { CommoditiesService } from '../reference/commodities.service';
import type { PriceJson } from './investment.models';

export interface Valuation {
  /** minor units of `currency`, or null when there is nothing to value it with */
  value: bigint | null;
  currency: string;
  valuedBy: 'price' | 'bond_formula' | 'none';
  price: PriceJson | null;
  estimated: boolean;
}

export type AssetWithCommodity = MoneyAsset & { commodity: MoneyCommodity };

/** What a holding is worth: the latest price on or before a day, or the bond formula over its lots. */
@Injectable()
export class ValuationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commodities: CommoditiesService,
  ) {}

  async latestPrice(db: Db | PrismaService, assetId: string, at: Date): Promise<PriceJson | null> {
    const row = await db.moneyPrice.findFirst({
      where: { assetId, date: { lte: at } },
      orderBy: [{ date: 'desc' }, { source: 'asc' }],
    });
    return row
      ? { price: row.price.toFixed(), currency: row.quoteCurrencyId, date: formatDate(row.date), source: row.source }
      : null;
  }

  /**
   * `units` scaled by 10^10; `lots` (acquisition day and units held) only matter for the bond formula.
   */
  async value(
    asset: AssetWithCommodity,
    units: bigint,
    lots: { acquiredAt: Date; units: bigint }[],
    at: Date,
    db: Db | PrismaService = this.prisma,
  ): Promise<Valuation> {
    const currency = asset.quoteCurrencyId;
    const decimals = await this.commodities.decimalsOf(currency);
    if (asset.valuation === 'bond_formula' && asset.valuationConfig) {
      try {
        const config = parseBondConfig(asset.valuationConfig);
        let value = 0n;
        let estimated = false;
        for (const lot of lots) {
          if (lot.units === 0n) continue;
          const v = bondValue(config, lot.acquiredAt, at, decimals);
          value += unitsValue(v.minor, lot.units);
          estimated ||= v.estimated;
        }
        return { value, currency, valuedBy: 'bond_formula', price: null, estimated };
      } catch {
        // a broken config falls back to prices, then to nothing
      }
    }
    const price = await this.latestPrice(db, asset.commodityId, at);
    if (!price) return { value: null, currency, valuedBy: 'none', price: null, estimated: false };
    const [num, den] = toFraction(price.price);
    const priceDecimals = await this.commodities.decimalsOf(price.currency);
    return {
      value: divRound(units * num * pow10(priceDecimals), den * pow10(10)),
      currency: price.currency,
      valuedBy: 'price',
      price,
      estimated: false,
    };
  }
}
