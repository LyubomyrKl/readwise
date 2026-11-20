import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@platform/db/prisma.service';
import { amountJson } from '../common/amounts';
import { CommoditiesService } from '../reference/commodities.service';
import type { HabitKind, HabitNoteResponse, HabitsResponse } from './movement.models';

/** One of your own accounts' currency legs: a movement's side on that account. */
interface Leg {
  transactionId: string;
  accountId: string;
  archived: boolean;
  currency: string;
  minor: bigint;
}

/**
 * What quick entry learns from the history of one kind of movement: the categories and accounts
 * used most, the account used last, and each note once with what it was last time. Read-only.
 * Only what stands counts: posted, not reversed (a reversal is a "correction" pointing at the
 * original; the version that replaced a corrected movement stands in its place).
 */
@Injectable()
export class HabitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commodities: CommoditiesService,
  ) {}

  async habits(userId: string, kind: HabitKind): Promise<HabitsResponse> {
    const stands = Prisma.sql`t."userId" = ${userId} AND t."status" = 'posted' AND t."kind"::text = ${kind}
      AND NOT EXISTS (SELECT 1 FROM "money_transaction" r WHERE r."correctsId" = t."id" AND r."kind" = 'correction')`;
    const lastYear = Prisma.sql`t."date" >= current_date - 365`;

    // a merged category counts as the one it went into
    const categories = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT COALESCE(cat."mergedIntoId", t."categoryId") AS id
        FROM "money_transaction" t
        JOIN "money_category" cat ON cat."id" = t."categoryId"
       WHERE ${stands} AND ${lastYear}
       GROUP BY 1
       ORDER BY count(*) DESC, max(t."date") DESC
       LIMIT 12`);

    // money out of an account (an expense, a transfer's source) and into one (income, its destination)
    const accounts = await this.prisma.$queryRaw<{ id: string; out: number; in: number; lastOut: Date | null; lastIn: Date | null }[]>(Prisma.sql`
      SELECT a."id",
             count(*) FILTER (WHERE e."amountMinor" < 0)::int AS "out",
             count(*) FILTER (WHERE e."amountMinor" > 0)::int AS "in",
             max(t."date") FILTER (WHERE e."amountMinor" < 0) AS "lastOut",
             max(t."date") FILTER (WHERE e."amountMinor" > 0) AS "lastIn"
        FROM "money_transaction" t
        JOIN "money_entry" e ON e."transactionId" = t."id"
        JOIN "money_sub_account" s ON s."id" = e."subAccountId"
        JOIN "money_account" a ON a."id" = s."accountId"
       WHERE ${stands} AND ${lastYear}
         AND a."type" <> 'system' AND a."archivedAt" IS NULL AND e."amountMinor" IS NOT NULL
       GROUP BY a."id"`);
    const ranked = (side: 'out' | 'in') =>
      accounts
        .filter((a) => a[side] > 0)
        .sort((a, b) => b[side] - a[side] || time(side === 'out' ? b.lastOut : b.lastIn) - time(side === 'out' ? a.lastOut : a.lastIn))
        .slice(0, 8)
        .map((a) => a.id);

    // each note once, whatever its case: how often, and the latest movement that had it
    const notes = await this.prisma.$queryRaw<{ id: string; note: string; date: string; categoryId: string | null; count: number }[]>(Prisma.sql`
      SELECT * FROM (
        SELECT DISTINCT ON (lower(t."note")) t."id", t."note", to_char(t."date", 'YYYY-MM-DD') AS "date",
               COALESCE(cat."mergedIntoId", t."categoryId") AS "categoryId",
               count(*) OVER (PARTITION BY lower(t."note"))::int AS "count"
          FROM "money_transaction" t
          LEFT JOIN "money_category" cat ON cat."id" = t."categoryId"
         WHERE ${stands} AND t."note" IS NOT NULL AND btrim(t."note") <> '' AND length(t."note") <= 120
         ORDER BY lower(t."note"), t."date" DESC, t."createdAt" DESC
      ) n
      ORDER BY n."count" DESC, n."date" DESC
      LIMIT 300`);

    const [last] = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT t."id" FROM "money_transaction" t WHERE ${stands} ORDER BY t."createdAt" DESC LIMIT 1`);

    const legs = await this.legs([...notes.map((n) => n.id), ...(last ? [last.id] : [])]);
    const sides = (transactionId: string) => {
      const own = legs.filter((l) => l.transactionId === transactionId);
      const out = own.find((l) => l.minor < 0n);
      const into = own.find((l) => l.minor > 0n);
      // where the money came from or went; for a transfer, both
      const main = kind === 'income' ? into : out;
      return { main, to: kind === 'transfer' ? into : undefined };
    };
    const open = (leg: Leg | undefined) => (leg && !leg.archived ? leg.accountId : null);

    const lastSides = last ? sides(last.id) : null;
    return {
      categories: categories.map((c) => c.id),
      accounts: ranked(kind === 'income' ? 'in' : 'out'),
      toAccounts: kind === 'transfer' ? ranked('in') : [],
      lastAccountId: open(lastSides?.main),
      lastToAccountId: open(lastSides?.to),
      notes: await Promise.all(
        notes.map(async (n): Promise<HabitNoteResponse> => {
          const { main, to } = sides(n.id);
          return {
            note: n.note,
            count: n.count,
            lastDate: n.date,
            categoryId: n.categoryId,
            accountId: open(main),
            toAccountId: open(to),
            amount: main ? amountJson(main.minor < 0n ? -main.minor : main.minor, main.currency, await this.commodities.decimalsOf(main.currency)) : null,
          };
        }),
      ),
    };
  }

  /** Your own accounts' currency legs of these movements. */
  private async legs(transactionIds: string[]): Promise<Leg[]> {
    if (transactionIds.length === 0) return [];
    const rows = await this.prisma.$queryRaw<{ transactionId: string; accountId: string; archived: boolean; currency: string; minor: string }[]>(Prisma.sql`
      SELECT e."transactionId", a."id" AS "accountId", a."archivedAt" IS NOT NULL AS "archived", s."commodityId" AS "currency",
             e."amountMinor"::text AS "minor"
        FROM "money_entry" e
        JOIN "money_sub_account" s ON s."id" = e."subAccountId"
        JOIN "money_account" a ON a."id" = s."accountId"
       WHERE e."transactionId" IN (${Prisma.join(transactionIds)}) AND a."type" <> 'system' AND e."amountMinor" IS NOT NULL`);
    return rows.map((r) => ({ ...r, minor: BigInt(r.minor) }));
  }
}

const time = (date: Date | null) => (date ? date.getTime() : 0);
