import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@platform/db/prisma.service';
import type { Db } from '../common/db';
import { CurrencyResponse } from './currency.models';

export interface CommodityInfo {
  id: string;
  kind: 'currency' | 'asset';
  code: string;
  name: string;
  decimals: number;
}

/**
 * Currencies come from the seeded table (rule 6) and never change at run time,
 * so they are read once; assets are read per request.
 */
@Injectable()
export class CommoditiesService {
  private currencies?: Promise<Map<string, CommodityInfo>>;

  constructor(private readonly prisma: PrismaService) {}

  private currencyMap(): Promise<Map<string, CommodityInfo>> {
    if (!this.currencies) {
      const loading = this.prisma.moneyCommodity
        .findMany({ where: { kind: 'currency' }, orderBy: { code: 'asc' } })
        .then(
          (rows) =>
            new Map<string, CommodityInfo>(
              rows.map((r) => [r.id, { id: r.id, kind: 'currency', code: r.code, name: r.name, decimals: r.decimals }]),
            ),
        );
      loading.catch(() => {
        this.currencies = undefined;
      });
      this.currencies = loading;
    }
    return this.currencies;
  }

  async list(): Promise<CurrencyResponse[]> {
    return [...(await this.currencyMap()).values()].map(({ code, name, decimals }) => ({ code, name, decimals }));
  }

  /** A supported currency, or 400. */
  async currency(code: string): Promise<CommodityInfo> {
    const found = (await this.currencyMap()).get(code.toUpperCase());
    if (!found) throw new BadRequestException(`unsupported currency: ${code}`);
    return found;
  }

  async isCurrency(id: string): Promise<boolean> {
    return (await this.currencyMap()).has(id);
  }

  /** Currencies and the user's assets by id; unknown ids are a 400. */
  async many(db: Db | PrismaService, userId: string, ids: Iterable<string>): Promise<Map<string, CommodityInfo>> {
    const currencies = await this.currencyMap();
    const out = new Map<string, CommodityInfo>();
    const assetIds: string[] = [];
    for (const id of new Set(ids)) {
      const currency = currencies.get(id);
      if (currency) out.set(id, currency);
      else assetIds.push(id);
    }
    if (assetIds.length > 0) {
      const rows = await db.moneyCommodity.findMany({ where: { id: { in: assetIds }, kind: 'asset', userId } });
      for (const r of rows) out.set(r.id, { id: r.id, kind: 'asset', code: r.code, name: r.name, decimals: r.decimals });
      const missing = assetIds.filter((id) => !out.has(id));
      if (missing.length > 0) throw new BadRequestException(`unknown currency or asset: ${missing.join(', ')}`);
    }
    return out;
  }

  /** Decimals of currencies, for formatting; assets fall back to 4. */
  async decimalsOf(id: string): Promise<number> {
    return (await this.currencyMap()).get(id)?.decimals ?? 4;
  }
}
