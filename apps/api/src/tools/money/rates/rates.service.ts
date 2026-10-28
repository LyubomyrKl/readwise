import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@platform/db/prisma.service';
import type { Db } from '../common/db';
import { addDays, formatDate } from '../core/dates';
import { convertMinor } from '../core/money';
import { RateBook, type RateRow } from '../core/rates';

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

  // ---- rate books for display (core/rates.ts) -------------------------------------------------

  /** The pivots every cross rate may need, with the currencies asked for. */
  private currencySet(currencies: Iterable<string>): string[] {
    return [...new Set([...currencies, 'EUR', 'PLN'])];
  }

  private async query(db: Db | PrismaService, sql: Prisma.Sql): Promise<RateRow[]> {
    const rows = await db.$queryRaw<{ source: string; fromId: string; toId: string; date: string; rate: string }[]>(sql);
    return rows.map((r) => ({ source: r.source as RateRow['source'], from: r.fromId, to: r.toId, date: r.date, rate: r.rate }));
  }

  /** The latest rate of every pair among `currencies` on or before `asOf`. */
  async latestBook(currencies: Iterable<string>, asOf: Date, db: Db | PrismaService = this.prisma): Promise<RateBook> {
    const set = this.currencySet(currencies);
    return new RateBook(
      await this.query(
        db,
        Prisma.sql`
          SELECT DISTINCT ON (source, "fromId", "toId") source::text AS source, "fromId", "toId",
                 to_char(date, 'YYYY-MM-DD') AS date, rate::text AS rate
            FROM "money_exchange_rate"
           WHERE date <= ${formatDate(asOf)}::date AND "fromId" IN (${Prisma.join(set)}) AND "toId" IN (${Prisma.join(set)})
           ORDER BY source, "fromId", "toId", date DESC`,
      ),
    );
  }

  /** Every rate in [from, to] plus the latest before `from`: for flows converted at their own day. */
  async rangeBook(currencies: Iterable<string>, from: Date, to: Date, db: Db | PrismaService = this.prisma): Promise<RateBook> {
    const set = this.currencySet(currencies);
    const start = formatDate(addDays(from, -1));
    const before = await this.query(
      db,
      Prisma.sql`
        SELECT DISTINCT ON (source, "fromId", "toId") source::text AS source, "fromId", "toId",
               to_char(date, 'YYYY-MM-DD') AS date, rate::text AS rate
          FROM "money_exchange_rate"
         WHERE date <= ${start}::date AND "fromId" IN (${Prisma.join(set)}) AND "toId" IN (${Prisma.join(set)})
         ORDER BY source, "fromId", "toId", date DESC`,
    );
    const within = await this.query(
      db,
      Prisma.sql`
        SELECT source::text AS source, "fromId", "toId", to_char(date, 'YYYY-MM-DD') AS date, rate::text AS rate
          FROM "money_exchange_rate"
         WHERE date > ${start}::date AND date <= ${formatDate(to)}::date
           AND "fromId" IN (${Prisma.join(set)}) AND "toId" IN (${Prisma.join(set)})`,
    );
    return new RateBook([...before, ...within]);
  }

  /** The last rate of each month of every pair, up to `to`: for month-end series. */
  async monthlyBook(currencies: Iterable<string>, to: Date, db: Db | PrismaService = this.prisma): Promise<RateBook> {
    const set = this.currencySet(currencies);
    return new RateBook(
      await this.query(
        db,
        Prisma.sql`
          SELECT DISTINCT ON (source, "fromId", "toId", date_trunc('month', date)) source::text AS source, "fromId", "toId",
                 to_char(date, 'YYYY-MM-DD') AS date, rate::text AS rate
            FROM "money_exchange_rate"
           WHERE date <= ${formatDate(to)}::date AND "fromId" IN (${Prisma.join(set)}) AND "toId" IN (${Prisma.join(set)})
           ORDER BY source, "fromId", "toId", date_trunc('month', date), date DESC`,
      ),
    );
  }
}
