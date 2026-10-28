import { Injectable } from '@nestjs/common';
import { PrismaService } from '@platform/db/prisma.service';
import type { Db } from '../common/db';
import { convertMinor } from '../core/money';

export interface TaxRate {
  /** units of PLN per unit of the currency */
  rate: string;
  /** the day of the table used */
  date: Date;
}

/**
 * Exchange rates as stored (rule 5: they convert for display and tax only).
 * Fetching them is the daily rates job; this reads.
 */
@Injectable()
export class RatesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The Polish tax rule: the NBP average rate of the last business day before
   * `date` (the last table published before it). Null when it is not stored yet.
   */
  async nbpBefore(db: Db | PrismaService, currency: string, date: Date): Promise<TaxRate | null> {
    if (currency === 'PLN') return { rate: '1', date };
    const row = await db.moneyExchangeRate.findFirst({
      where: { source: 'nbp', fromId: currency, toId: 'PLN', date: { lt: date } },
      orderBy: { date: 'desc' },
    });
    return row ? { rate: row.rate.toFixed(), date: row.date } : null;
  }

  /** An amount in PLN at the NBP rate of the business day before `date`, or null. */
  async toPlnForTax(
    db: Db | PrismaService,
    minor: bigint,
    currency: string,
    currencyDecimals: number,
    date: Date,
  ): Promise<{ minor: bigint; rate: string; rateDate: Date } | null> {
    const found = await this.nbpBefore(db, currency, date);
    if (!found) return null;
    return { minor: convertMinor(minor, currencyDecimals, found.rate, 2), rate: found.rate, rateDate: found.date };
  }
}
