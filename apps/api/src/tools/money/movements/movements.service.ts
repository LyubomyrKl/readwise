import { BadRequestException, Injectable } from '@nestjs/common';
import type { ClassConstructor } from 'class-transformer';
import { PrismaService } from '@platform/db/prisma.service';
import { WRITE_TX, type Db } from '../common/db';
import { toDate, toMinor } from '../common/parse';
import { validateInput } from '../common/validation';
import {
  expenseLines,
  incomeLines,
  openingBalanceLines,
  transferLines,
  type PostingLine,
} from '../core/postings';
import { asBadRequest, LedgerService, type PostedTransaction } from '../ledger/ledger.service';
import { CommoditiesService } from '../reference/commodities.service';
import { TransactionsService } from '../transactions/transactions.service';
import {
  ExpenseDto,
  FeeDto,
  IncomeDto,
  MovementDto,
  OpeningBalanceDto,
  TransferDto,
  type MovementKind,
} from './movement.models';

export interface PostContext {
  /** "user", "token:<id>", "recurring:<id>", "import:<batchId>" */
  actor: string;
  /** run inside the caller's database transaction */
  db?: Db;
  /** post this draft (its row becomes the transaction) */
  draftId?: string;
  importRowId?: string;
  recurringRuleId?: string;
  correctsId?: string;
}

export interface MovementHandler<T extends object = object> {
  dto: ClassConstructor<T>;
  post(db: Db, userId: string, input: T, ctx: PostContext): Promise<PostedTransaction>;
}

/**
 * Every movement kind behind one entry point, so the endpoints, drafts, imports,
 * recurring rules and Claude's proposals all validate and post the same way.
 * Investments register buy, sell, investment income, unit moves and splits.
 */
@Injectable()
export class MovementsService {
  private readonly handlers = new Map<MovementKind, MovementHandler<object>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly commodities: CommoditiesService,
    private readonly transactions: TransactionsService,
  ) {
    this.register('income', { dto: IncomeDto, post: (db, u, i: IncomeDto, c) => this.income(db, u, i, c) });
    this.register('expense', { dto: ExpenseDto, post: (db, u, i: ExpenseDto, c) => this.expense(db, u, i, c, 'expense') });
    this.register('fee', { dto: FeeDto, post: (db, u, i: FeeDto, c) => this.expense(db, u, i, c, 'fee') });
    this.register('opening_balance', {
      dto: OpeningBalanceDto,
      post: (db, u, i: OpeningBalanceDto, c) => this.openingBalance(db, u, i, c),
    });
    this.register('transfer', { dto: TransferDto, post: (db, u, i: TransferDto, c) => this.transfer(db, u, i, c) });
  }

  register<T extends object>(kind: MovementKind, handler: MovementHandler<T>): void {
    this.handlers.set(kind, handler);
  }

  handler(kind: MovementKind): MovementHandler<object> {
    const handler = this.handlers.get(kind);
    if (!handler) throw new BadRequestException(`unknown movement kind: ${kind}`);
    return handler;
  }

  /** Validates `input` with the kind's DTO and posts it, in the caller's transaction or a new one. */
  async post(userId: string, movement: MovementDto, ctx: PostContext): Promise<PostedTransaction> {
    const handler = this.handler(movement.kind);
    const input = await validateInput(handler.dto, movement.input);
    await this.ledger.ensureSetup(userId);
    const run = (db: Db) => handler.post(db, userId, input, ctx);
    return ctx.db ? run(ctx.db) : this.prisma.$transaction(run, WRITE_TX);
  }

  /** An edit: the original is reversed and the corrected movement posted, in one database transaction. */
  async correct(userId: string, id: string, movement: MovementDto, actor = 'user'): Promise<PostedTransaction> {
    const handler = this.handler(movement.kind);
    const input = await validateInput(handler.dto, movement.input);
    await this.ledger.ensureSetup(userId);
    return this.prisma.$transaction(async (db) => {
      await this.transactions.reverseIn(db, userId, id, { note: 'Corrected' }, actor);
      return handler.post(db, userId, input, { actor, db, correctsId: id });
    }, WRITE_TX);
  }

  // ---- cash movements -------------------------------------------------------------------

  private async income(db: Db, userId: string, dto: IncomeDto, ctx: PostContext) {
    const currency = await this.commodities.currency(dto.currency);
    const categoryId = dto.categoryId ?? (await this.ledger.categoryByKey(db, userId, 'other_income'));
    const lines = this.build(() =>
      incomeLines({ accountId: dto.accountId, currency: currency.id, amount: toMinor(dto.amount, currency.decimals), categoryId }),
    );
    return this.ledger.post(db, userId, lines, { ...this.opts(dto, ctx), kind: 'income', categoryId });
  }

  private async expense(db: Db, userId: string, dto: ExpenseDto, ctx: PostContext, kind: 'expense' | 'fee') {
    const currency = await this.commodities.currency(dto.currency);
    const categoryId =
      dto.categoryId ?? (await this.ledger.categoryByKey(db, userId, kind === 'fee' ? 'fees' : 'other_expense'));
    const lines = this.build(() =>
      expenseLines({ accountId: dto.accountId, currency: currency.id, amount: toMinor(dto.amount, currency.decimals), categoryId }),
    );
    return this.ledger.post(db, userId, lines, { ...this.opts(dto, ctx), kind, categoryId });
  }

  private async openingBalance(db: Db, userId: string, dto: OpeningBalanceDto, ctx: PostContext) {
    const currency = await this.commodities.currency(dto.currency);
    const lines = this.build(() =>
      openingBalanceLines({ accountId: dto.accountId, currency: currency.id, amount: toMinor(dto.amount, currency.decimals) }),
    );
    return this.ledger.post(db, userId, lines, { ...this.opts(dto, ctx), kind: 'opening_balance' });
  }

  private async transfer(db: Db, userId: string, dto: TransferDto, ctx: PostContext) {
    const from = await this.commodities.currency(dto.fromCurrency);
    const to = await this.commodities.currency(dto.toCurrency ?? dto.fromCurrency);
    const fee = dto.fee ? toMinor(dto.fee, from.decimals, 'fee') : 0n;
    const feeCategoryId = fee > 0n ? (dto.feeCategoryId ?? (await this.ledger.categoryByKey(db, userId, 'fees'))) : null;
    const plan = this.build(() =>
      transferLines({
        from: { accountId: dto.fromAccountId, currency: from.id, amount: toMinor(dto.amountOut, from.decimals, 'amountOut') },
        to: {
          accountId: dto.toAccountId,
          currency: to.id,
          amount: dto.amountIn ? toMinor(dto.amountIn, to.decimals, 'amountIn') : undefined,
        },
        fee,
        feeCategoryId,
      }),
    );
    return this.ledger.post(db, userId, plan.lines, { ...this.opts(dto, ctx), kind: 'transfer', categoryId: feeCategoryId });
  }

  opts(dto: { date: string; note?: string }, ctx: PostContext) {
    return {
      actor: ctx.actor,
      date: toDate(dto.date),
      note: dto.note,
      draftId: ctx.draftId,
      importRowId: ctx.importRowId,
      recurringRuleId: ctx.recurringRuleId,
      correctsId: ctx.correctsId,
    };
  }

  build<T extends PostingLine[] | { lines: PostingLine[] }>(fn: () => T): T {
    try {
      return fn();
    } catch (error) {
      throw asBadRequest(error);
    }
  }
}
