import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { MoneyTransactionKind, Prisma } from '@prisma/client';
import { PrismaService } from '@platform/db/prisma.service';
import { amountJson, unitsJson } from '../common/amounts';
import { WRITE_TX, type Db } from '../common/db';
import { toDate } from '../common/parse';
import { formatDate } from '../core/dates';
import { impliedRate } from '../core/money';
import { quantityFromDb } from '../core/quantity';
import { reversalLines, type PostingLine } from '../core/postings';
import { asBadRequest, LedgerService, type PostedTransaction } from '../ledger/ledger.service';
import { CommoditiesService } from '../reference/commodities.service';
import { ListTransactionsQuery, TransactionPage, TransactionResponse } from './transaction.models';

const INCLUDE = {
  entries: {
    include: { subAccount: { include: { account: true } }, category: true },
    orderBy: { id: 'asc' },
  },
  category: true,
  asset: { include: { commodity: true } },
  correctedBy: { select: { id: true, kind: true } },
} satisfies Prisma.MoneyTransactionInclude;

type TransactionRow = Prisma.MoneyTransactionGetPayload<{ include: typeof INCLUDE }>;

/** Hook for movements whose reversal also has to undo lots (buys, sells, unit moves, splits). */
export interface ReversalHook {
  reverse(db: Db, userId: string, original: PostedTransaction, reversal: PostedTransaction): Promise<void>;
}

const LOT_KINDS: MoneyTransactionKind[] = ['buy', 'sell', 'unit_move', 'split'];

@Injectable()
export class TransactionsService {
  private lotReversal?: ReversalHook;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly commodities: CommoditiesService,
  ) {}

  /** Investments register how their lots are undone. */
  useLotReversal(hook: ReversalHook): void {
    this.lotReversal = hook;
  }

  async list(userId: string, query: ListTransactionsQuery, status: 'posted' | 'draft' = 'posted'): Promise<TransactionPage> {
    const limit = Math.min(Math.max(Number(query.limit ?? 50), 1), 500);
    const where: Prisma.MoneyTransactionWhereInput = { userId, status };
    const and: Prisma.MoneyTransactionWhereInput[] = [];
    if (query.from) and.push({ date: { gte: toDate(query.from, 'from') } });
    if (query.to) and.push({ date: { lte: toDate(query.to, 'to') } });
    if (query.kind) and.push({ kind: query.kind as MoneyTransactionKind });
    if (query.accountId) and.push({ entries: { some: { subAccount: { accountId: query.accountId } } } });
    if (query.categoryId) {
      and.push({ OR: [{ categoryId: query.categoryId }, { entries: { some: { categoryId: query.categoryId } } }] });
    }
    if (query.assetId) {
      and.push({ OR: [{ assetId: query.assetId }, { entries: { some: { subAccount: { commodityId: query.assetId } } } }] });
    }
    if (query.q) and.push({ note: { contains: query.q, mode: 'insensitive' } });
    if (query.before) {
      const [date, id] = query.before.split('_');
      if (!date || !id) throw new BadRequestException('before: not a cursor');
      const d = toDate(date, 'before');
      and.push({ OR: [{ date: { lt: d } }, { date: d, id: { lt: id } }] });
    }
    if (and.length > 0) where.AND = and;

    const rows = await this.prisma.moneyTransaction.findMany({
      where,
      include: INCLUDE,
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: await this.present(userId, page),
      nextCursor: rows.length > limit && last ? `${formatDate(last.date)}_${last.id}` : null,
    };
  }

  async get(userId: string, id: string): Promise<TransactionResponse> {
    const row = await this.prisma.moneyTransaction.findFirst({ where: { id, userId }, include: INCLUDE });
    if (!row) throw new NotFoundException('transaction not found');
    return (await this.present(userId, [row]))[0];
  }

  /** Reverses a posted transaction: a correction with every entry negated, pointing at the original. */
  async reverse(userId: string, id: string, opts: { date?: string; note?: string }, actor = 'user'): Promise<TransactionResponse> {
    await this.ledger.ensureSetup(userId);
    const reversal = await this.prisma.$transaction((db) => this.reverseIn(db, userId, id, opts, actor), WRITE_TX);
    return this.get(userId, reversal.id);
  }

  async reverseIn(db: Db, userId: string, id: string, opts: { date?: string; note?: string }, actor: string): Promise<PostedTransaction> {
    await this.ledger.lock(db, userId);
    const original = await this.ledger.load(db, userId, id);
    if (original.status !== 'posted') throw new BadRequestException('a draft has nothing to reverse; drop it instead');
    if (original.kind === 'correction') {
      throw new BadRequestException('a reversal cannot be reversed; post the movement again instead');
    }
    const already = await db.moneyTransaction.findFirst({ where: { correctsId: id, kind: 'correction' } });
    if (already) throw new ConflictException('this transaction was already reversed');
    if (LOT_KINDS.includes(original.kind) && !this.lotReversal) {
      throw new BadRequestException(`reversing a ${original.kind} needs the investments module`);
    }
    let lines: PostingLine[];
    try {
      lines = reversalLines(this.ledger.linesOf(original));
    } catch (error) {
      throw asBadRequest(error);
    }
    const reversal = await this.ledger.post(db, userId, lines, {
      actor,
      kind: 'correction',
      date: opts.date ? toDate(opts.date) : original.date,
      note: opts.note?.trim() || `Reverses ${original.kind.replace('_', ' ')}${original.note ? `: ${original.note}` : ''}`,
      categoryId: original.categoryId,
      assetId: original.assetId,
      correctsId: original.id,
      allowArchived: true,
    });
    if (LOT_KINDS.includes(original.kind)) await this.lotReversal!.reverse(db, userId, original, reversal);
    return reversal;
  }

  async present(userId: string, rows: TransactionRow[]): Promise<TransactionResponse[]> {
    const commodityIds = rows.flatMap((r) => r.entries.map((e) => e.subAccount.commodityId));
    const commodities = await this.commodities.many(this.prisma, userId, commodityIds);
    return rows.map((row) => {
      const entries = row.entries.map((e) => {
        const c = commodities.get(e.subAccount.commodityId)!;
        const account = e.subAccount.account;
        return {
          id: e.id,
          accountId: account.id,
          accountName: account.name,
          accountType: account.type,
          systemRole: account.systemRole,
          commodityId: c.id,
          code: c.code,
          amount: e.amountMinor === null ? null : amountJson(e.amountMinor, c.id, c.decimals),
          units: e.quantity === null ? null : unitsJson(quantityFromDb(e.quantity)),
          categoryId: e.categoryId,
          categoryName: e.category?.name ?? null,
        };
      });

      // the rate a cross-currency movement implies, from its two conversion legs; a reversal
      // shows the rate of the movement it reverses, not its inverse
      let rate: string | null = null;
      const conversion = row.entries.filter(
        (e) => e.subAccount.account.systemRole === 'conversion' && e.amountMinor !== null,
      );
      const reversal = row.kind === 'correction';
      const sent = conversion.find((e) => (reversal ? e.amountMinor! < 0n : e.amountMinor! > 0n));
      const received = conversion.find((e) => (reversal ? e.amountMinor! > 0n : e.amountMinor! < 0n));
      if (conversion.length === 2 && sent && received && row.kind !== 'buy' && row.kind !== 'sell') {
        const from = commodities.get(sent.subAccount.commodityId)!;
        const to = commodities.get(received.subAccount.commodityId)!;
        const abs = (v: bigint) => (v < 0n ? -v : v);
        rate = impliedRate(abs(sent.amountMinor!), from.decimals, abs(received.amountMinor!), to.decimals);
      }

      return {
        id: row.id,
        date: formatDate(row.date),
        kind: row.kind,
        status: row.status,
        note: row.note,
        category: row.category ? { id: row.category.id, name: row.category.name } : null,
        asset: row.asset ? { id: row.asset.commodityId, name: row.asset.commodity.code } : null,
        correctsId: row.correctsId,
        reversedBy: row.correctedBy.find((c) => c.kind === 'correction')?.id ?? null,
        replacedBy: row.correctedBy.find((c) => c.kind !== 'correction')?.id ?? null,
        proposedBy: row.proposedBy,
        impliedRate: rate,
        draft: row.draft ?? null,
        entries,
        createdAt: row.createdAt.toISOString(),
        postedAt: row.postedAt?.toISOString() ?? null,
      };
    });
  }
}

export { INCLUDE as TRANSACTION_INCLUDE };
