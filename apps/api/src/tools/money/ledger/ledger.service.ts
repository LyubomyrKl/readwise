import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { MoneyAccount, MoneyEntry, MoneySubAccount, MoneySystemRole, MoneyTransaction, MoneyTransactionKind, Prisma } from '@prisma/client';
import { PrismaService } from '@platform/db/prisma.service';
import type { Db } from '../common/db';
import { assertBalanced, UnbalancedTransactionError } from '../core/ledger';
import { PostingError, refKey, type PostingLine, type SystemRole } from '../core/postings';
import { quantityFromDb, quantityToDb } from '../core/quantity';
import { CommoditiesService } from '../reference/commodities.service';
import { AuditService } from './audit.service';

export const SYSTEM_ROLES: readonly MoneySystemRole[] = ['income', 'expense', 'opening_balance', 'conversion'];

const SYSTEM_NAMES: Record<MoneySystemRole, string> = {
  income: 'Income',
  expense: 'Expenses',
  opening_balance: 'Opening balances',
  conversion: 'Currency and trade conversion',
};

/** Categories the ledger itself books to; the user may rename them. */
export const DEFAULT_CATEGORIES: { name: string; kind: 'income' | 'expense'; key?: string }[] = [
  { name: 'Salary', kind: 'income' },
  { name: 'Interest', kind: 'income', key: 'interest' },
  { name: 'Dividends', kind: 'income', key: 'dividends' },
  { name: 'Other income', kind: 'income', key: 'other_income' },
  { name: 'Housing', kind: 'expense' },
  { name: 'Groceries', kind: 'expense' },
  { name: 'Transport', kind: 'expense' },
  { name: 'Health', kind: 'expense' },
  { name: 'Bills and utilities', kind: 'expense' },
  { name: 'Shopping', kind: 'expense' },
  { name: 'Leisure', kind: 'expense' },
  { name: 'Fees', kind: 'expense', key: 'fees' },
  { name: 'Taxes', kind: 'expense', key: 'taxes' },
  { name: 'Other expenses', kind: 'expense', key: 'other_expense' },
];

export interface PostOptions {
  /** "user", "token:<id>", "recurring:<id>", "import:<batchId>" */
  actor: string;
  kind: MoneyTransactionKind;
  date: Date;
  note?: string | null;
  categoryId?: string | null;
  assetId?: string | null;
  correctsId?: string | null;
  recurringRuleId?: string | null;
  importRowId?: string | null;
  /** post this draft: its row becomes the transaction */
  draftId?: string | null;
  /** corrections may touch archived accounts; new movements may not */
  allowArchived?: boolean;
}

export type EntryWithAccount = MoneyEntry & { subAccount: MoneySubAccount & { account: MoneyAccount } };
export type PostedTransaction = MoneyTransaction & { entries: EntryWithAccount[] };

/**
 * The single write path into the ledger. Resolves sub-accounts (creating them
 * on first use), checks ownership, archive state and categories, checks the
 * lines balance (rule 2) and writes the transaction with its entries through
 * the caller's database transaction (rule 3). The database checks it again.
 */
@Injectable()
export class LedgerService {
  private readonly ready = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly commodities: CommoditiesService,
    private readonly audit: AuditService,
  ) {}

  /** Settings row, system accounts and default categories; idempotent, outside any write transaction. */
  async ensureSetup(userId: string): Promise<void> {
    if (this.ready.has(userId)) return;
    await this.prisma.moneySettings.upsert({ where: { userId }, create: { userId }, update: {} });
    for (const role of SYSTEM_ROLES) {
      await this.prisma.moneyAccount.upsert({
        where: { userId_systemRole: { userId, systemRole: role } },
        create: { userId, name: SYSTEM_NAMES[role], type: 'system', systemRole: role },
        update: {},
      });
    }
    if ((await this.prisma.moneyCategory.count({ where: { userId } })) === 0) {
      await this.prisma.moneyCategory.createMany({
        data: DEFAULT_CATEGORIES.map((c) => ({ userId, name: c.name, kind: c.kind, key: c.key ?? null })),
        skipDuplicates: true,
      });
    }
    this.ready.add(userId);
  }

  /** Forget the setup cache (tests that delete users). */
  forget(userId: string): void {
    this.ready.delete(userId);
  }

  async categoryByKey(db: Db | PrismaService, userId: string, key: string): Promise<string> {
    const category = await db.moneyCategory.findUnique({ where: { userId_key: { userId, key } } });
    if (category) return category.id;
    const fallback = DEFAULT_CATEGORIES.find((c) => c.key === key);
    if (!fallback) throw new BadRequestException(`no category with key ${key}`);
    return (await db.moneyCategory.create({ data: { userId, name: fallback.name, kind: fallback.kind, key } })).id;
  }

  async post(db: Db, userId: string, lines: PostingLine[], opts: PostOptions): Promise<PostedTransaction> {
    try {
      assertBalanced(
        lines.map((l) => ({
          subAccountId: `${refKey(l.account)}/${l.commodityId}`,
          commodityId: l.commodityId,
          amountMinor: l.amountMinor,
          quantity: l.quantity,
        })),
      );
    } catch (error) {
      throw asBadRequest(error);
    }

    const commodities = await this.commodities.many(db, userId, lines.map((l) => l.commodityId));
    for (const line of lines) {
      const kind = commodities.get(line.commodityId)!.kind;
      if ((kind === 'currency') !== (line.amountMinor !== undefined)) {
        throw new BadRequestException(`${line.commodityId} is ${kind === 'currency' ? 'a currency' : 'an asset'}; the entry has the wrong amount type`);
      }
    }

    // own accounts: the user's, not system, not archived
    const ownIds = [...new Set(lines.flatMap((l) => ('accountId' in l.account ? [l.account.accountId] : [])))];
    const accounts = await db.moneyAccount.findMany({ where: { id: { in: ownIds }, userId } });
    for (const id of ownIds) {
      const account = accounts.find((a) => a.id === id);
      if (!account || account.type === 'system') throw new NotFoundException(`account ${id} not found`);
      if (account.archivedAt && !opts.allowArchived) {
        throw new BadRequestException(`${account.name} is archived; unarchive it to record new movements`);
      }
    }

    // categories: the user's, and of the right kind for the line
    await this.checkCategories(db, userId, lines, opts.categoryId);

    // sub-accounts, created on first use
    const systemAccounts = await db.moneyAccount.findMany({ where: { userId, type: 'system' } });
    const accountIdOf = (line: PostingLine): string => {
      if ('accountId' in line.account) return line.account.accountId;
      const role = line.account.system;
      const found = systemAccounts.find((a) => a.systemRole === role);
      if (!found) throw new Error(`system account ${role} missing; ensureSetup was not called`);
      return found.id;
    };
    const subAccountIds = new Map<string, string>();
    for (const line of lines) {
      const accountId = accountIdOf(line);
      const key = `${accountId}/${line.commodityId}`;
      if (subAccountIds.has(key)) continue;
      const sub = await db.moneySubAccount.upsert({
        where: { accountId_commodityId: { accountId, commodityId: line.commodityId } },
        create: { accountId, commodityId: line.commodityId },
        update: {},
      });
      subAccountIds.set(key, sub.id);
    }

    const entries = lines.map((line) => ({
      subAccountId: subAccountIds.get(`${accountIdOf(line)}/${line.commodityId}`)!,
      amountMinor: line.amountMinor ?? null,
      quantity: line.quantity === undefined ? null : quantityToDb(line.quantity),
      categoryId: line.categoryId ?? null,
    }));

    const header = {
      date: opts.date,
      kind: opts.kind,
      status: 'posted' as const,
      note: opts.note?.trim() || null,
      categoryId: opts.categoryId ?? null,
      assetId: opts.assetId ?? null,
      correctsId: opts.correctsId ?? null,
      recurringRuleId: opts.recurringRuleId ?? null,
      importRowId: opts.importRowId ?? null,
      postedAt: new Date(),
    };

    let transactionId: string;
    if (opts.draftId) {
      const draft = await db.moneyTransaction.findFirst({ where: { id: opts.draftId, userId, status: 'draft' } });
      if (!draft) throw new NotFoundException('draft not found or already posted');
      await db.moneyTransaction.update({ where: { id: draft.id }, data: header });
      transactionId = draft.id;
    } else {
      transactionId = (await db.moneyTransaction.create({ data: { userId, proposedBy: opts.actor, ...header } })).id;
    }
    await db.moneyEntry.createMany({ data: entries.map((e) => ({ transactionId, ...e })) });

    await this.audit.record(db, {
      userId,
      actor: opts.actor,
      action: opts.draftId ? 'draft.post' : 'transaction.post',
      subjectId: transactionId,
      details: { kind: opts.kind, date: opts.date, correctsId: opts.correctsId ?? undefined },
    });

    return this.load(db, userId, transactionId);
  }

  async load(db: Db | PrismaService, userId: string, id: string): Promise<PostedTransaction> {
    const tx = await db.moneyTransaction.findFirst({
      where: { id, userId },
      include: { entries: { include: { subAccount: { include: { account: true } } }, orderBy: { id: 'asc' } } },
    });
    if (!tx) throw new NotFoundException('transaction not found');
    return tx;
  }

  /** The lines of a posted transaction, as they would be posted again (for reversals). */
  linesOf(tx: PostedTransaction): PostingLine[] {
    return tx.entries.map((e) => {
      const account = e.subAccount.account;
      return {
        account: account.type === 'system' ? { system: account.systemRole as SystemRole } : { accountId: account.id },
        commodityId: e.subAccount.commodityId,
        amountMinor: e.amountMinor ?? undefined,
        quantity: e.quantity === null ? undefined : quantityFromDb(e.quantity),
        categoryId: e.categoryId,
      };
    });
  }

  private async checkCategories(db: Db, userId: string, lines: PostingLine[], mainCategoryId?: string | null) {
    const ids = new Set(lines.flatMap((l) => (l.categoryId ? [l.categoryId] : [])));
    if (mainCategoryId) ids.add(mainCategoryId);
    if (ids.size === 0) return;
    const categories = await db.moneyCategory.findMany({ where: { id: { in: [...ids] }, userId } });
    for (const id of ids) {
      if (!categories.some((c) => c.id === id)) throw new NotFoundException(`category ${id} not found`);
    }
    for (const line of lines) {
      if (!line.categoryId || 'accountId' in line.account) continue;
      const category = categories.find((c) => c.id === line.categoryId)!;
      const expected = line.account.system === 'income' ? 'income' : line.account.system === 'expense' ? 'expense' : null;
      if (expected && category.kind !== expected) {
        throw new BadRequestException(`${category.name} is an ${category.kind} category; this line needs an ${expected} category`);
      }
    }
  }
}

export function asBadRequest(error: unknown): Error {
  if (error instanceof PostingError || error instanceof UnbalancedTransactionError) {
    return new BadRequestException(error.message);
  }
  return error instanceof Error ? error : new Error(String(error));
}

/** Prisma JSON input for a value that may hold BigInts. */
export function jsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v))) as Prisma.InputJsonValue;
}
