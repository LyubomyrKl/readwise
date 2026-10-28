import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@platform/db/prisma.service';
import { parseQuantity } from '../core/quantity';

export interface SubAccountTotal {
  subAccountId: string;
  accountId: string;
  commodityId: string;
  /** currency sub-accounts: sum of minor units */
  minor: bigint;
  /** asset sub-accounts: sum of units, scaled by 10^10 */
  units: bigint;
}

const FAR_FUTURE = '9999-12-31';

/** Balances are sums of entries (rule 2), computed in Postgres. */
@Injectable()
export class BalancesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every sub-account of the user's accounts with its balance at the end of `asOf` (default: all time). */
  async subAccountTotals(
    userId: string,
    opts: { asOf?: Date; includeSystem?: boolean; accountIds?: string[] } = {},
  ): Promise<SubAccountTotal[]> {
    const asOf = opts.asOf ? opts.asOf.toISOString().slice(0, 10) : FAR_FUTURE;
    const accountFilter =
      opts.accountIds && opts.accountIds.length > 0
        ? Prisma.sql`AND a."id" IN (${Prisma.join(opts.accountIds)})`
        : Prisma.empty;
    const systemFilter = opts.includeSystem ? Prisma.empty : Prisma.sql`AND a."type" <> 'system'`;
    const rows = await this.prisma.$queryRaw<
      { subAccountId: string; accountId: string; commodityId: string; minor: string; qty: string }[]
    >(Prisma.sql`
      SELECT s."id" AS "subAccountId", s."accountId", s."commodityId",
             COALESCE(SUM(x."amountMinor"), 0)::text AS minor,
             COALESCE(SUM(x."quantity"), 0)::text AS qty
        FROM "money_sub_account" s
        JOIN "money_account" a ON a."id" = s."accountId"
        LEFT JOIN (
          SELECT e."subAccountId", e."amountMinor", e."quantity"
            FROM "money_entry" e
            JOIN "money_transaction" t ON t."id" = e."transactionId"
           WHERE t."userId" = ${userId} AND t."status" = 'posted' AND t."date" <= ${asOf}::date
        ) x ON x."subAccountId" = s."id"
       WHERE a."userId" = ${userId} ${systemFilter} ${accountFilter}
       GROUP BY s."id", s."accountId", s."commodityId"
    `);
    return rows.map((r) => ({
      subAccountId: r.subAccountId,
      accountId: r.accountId,
      commodityId: r.commodityId,
      minor: BigInt(r.minor),
      units: parseQuantity(r.qty),
    }));
  }
}
