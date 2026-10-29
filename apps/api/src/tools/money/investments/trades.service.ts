import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import type { MoneyAsset, MoneyCommodity } from '@prisma/client';
import type { Db } from '../common/db';
import { toMinor, toUnits } from '../common/parse';
import type { CostBasisMethod } from '../core/lots';
import { buyLines, investmentIncomeLines, sellLines, splitLines, unitMoveLines } from '../core/postings';
import { LedgerService, type PostedTransaction } from '../ledger/ledger.service';
import { MovementsService, type PostContext } from '../movements/movements.service';
import { CommoditiesService } from '../reference/commodities.service';
import { TransactionsService } from '../transactions/transactions.service';
import { BuyDto, InvestmentIncomeDto, SellDto, SplitDto, UnitMoveDto } from './investment.models';
import { LotsService } from './lots.service';

/**
 * The investment movements: buy, sell, investment income, unit move and
 * split. They join the one movement path (MovementsService), so drafts,
 * imports, recurring rules and Claude post them like any other movement; the
 * lots move in the same database transaction as the entries.
 */
@Injectable()
export class TradesService implements OnModuleInit {
  constructor(
    private readonly ledger: LedgerService,
    private readonly movements: MovementsService,
    private readonly transactions: TransactionsService,
    private readonly commodities: CommoditiesService,
    private readonly lots: LotsService,
  ) {}

  onModuleInit(): void {
    this.movements.register('buy', { dto: BuyDto, post: (db, u, i: BuyDto, c) => this.buy(db, u, i, c) });
    this.movements.register('sell', { dto: SellDto, post: (db, u, i: SellDto, c) => this.sell(db, u, i, c) });
    this.movements.register('investment_income', {
      dto: InvestmentIncomeDto,
      post: (db, u, i: InvestmentIncomeDto, c) => this.investmentIncome(db, u, i, c),
    });
    this.movements.register('unit_move', { dto: UnitMoveDto, post: (db, u, i: UnitMoveDto, c) => this.unitMove(db, u, i, c) });
    this.movements.register('split', { dto: SplitDto, post: (db, u, i: SplitDto, c) => this.split(db, u, i, c) });
    this.transactions.useLotReversal(this.lots);
  }

  async buy(db: Db, userId: string, dto: BuyDto, ctx: PostContext): Promise<PostedTransaction> {
    const asset = await this.assetOf(db, userId, dto.assetId);
    const currency = await this.commodities.currency(dto.currency);
    const units = toUnits(dto.units);
    const total = toMinor(dto.total, currency.decimals, 'total');
    const lines = this.movements.build(() =>
      buyLines({
        accountId: dto.accountId,
        assetId: asset.commodityId,
        units,
        paidFrom: { accountId: dto.paidFromAccountId ?? dto.accountId, currency: currency.id },
        total,
        heldBefore: dto.heldBefore,
      }),
    );
    const tx = await this.ledger.post(db, userId, lines, {
      ...this.movements.opts(dto, ctx),
      kind: 'buy',
      assetId: asset.commodityId,
      note: dto.note ?? (dto.heldBefore ? `Held before tracking: ${asset.commodity.code}` : undefined),
    });
    const entry = tx.entries.find(
      (e) => e.subAccount.accountId === dto.accountId && e.subAccount.commodityId === asset.commodityId && e.quantity !== null,
    );
    if (!entry) throw new Error('buy without the units entry');
    let tradeCost: bigint | null = null;
    let tradeCurrency: string | null = null;
    if (dto.tradeAmount && dto.tradeCurrency) {
      const trade = await this.commodities.currency(dto.tradeCurrency);
      tradeCost = toMinor(dto.tradeAmount, trade.decimals, 'tradeAmount');
      tradeCurrency = trade.id;
    }
    await this.lots.open(db, {
      accountId: dto.accountId,
      assetId: asset.commodityId,
      transactionId: tx.id,
      openingEntryId: entry.id,
      units,
      costMinor: total,
      costCurrency: currency.id,
      acquiredAt: tx.date,
      tradeCostMinor: tradeCost,
      tradeCurrency,
    });
    return tx;
  }

  async sell(db: Db, userId: string, dto: SellDto, ctx: PostContext): Promise<PostedTransaction> {
    const asset = await this.assetOf(db, userId, dto.assetId);
    const currency = await this.commodities.currency(dto.currency);
    const units = toUnits(dto.units);
    const lines = this.movements.build(() =>
      sellLines({
        accountId: dto.accountId,
        assetId: asset.commodityId,
        units,
        proceedsTo: { accountId: dto.proceedsToAccountId ?? dto.accountId, currency: currency.id },
        proceeds: toMinor(dto.proceeds, currency.decimals, 'proceeds'),
      }),
    );
    const tx = await this.ledger.post(db, userId, lines, { ...this.movements.opts(dto, ctx), kind: 'sell', assetId: asset.commodityId });
    await this.lots.consume(db, tx.id, dto.accountId, asset.commodityId, units, await this.methodOf(db, userId, dto.accountId), 'sale', tx.date);
    return tx;
  }

  async investmentIncome(db: Db, userId: string, dto: InvestmentIncomeDto, ctx: PostContext): Promise<PostedTransaction> {
    const currency = await this.commodities.currency(dto.currency);
    const assetId = dto.assetId ? (await this.assetOf(db, userId, dto.assetId)).commodityId : null;
    const key = dto.incomeType === 'interest' ? 'interest' : dto.incomeType === 'other' ? 'other_income' : 'dividends';
    const incomeCategoryId = dto.incomeCategoryId ?? (await this.ledger.categoryByKey(db, userId, key));
    const withholding = dto.withholding ? toMinor(dto.withholding, currency.decimals, 'withholding') : 0n;
    const taxCategoryId = withholding > 0n ? (dto.taxCategoryId ?? (await this.ledger.categoryByKey(db, userId, 'taxes'))) : null;
    const lines = this.movements.build(() =>
      investmentIncomeLines({
        accountId: dto.accountId,
        currency: currency.id,
        net: toMinor(dto.amount, currency.decimals),
        withholding,
        incomeCategoryId,
        taxCategoryId,
      }),
    );
    return this.ledger.post(db, userId, lines, {
      ...this.movements.opts(dto, ctx),
      kind: 'investment_income',
      categoryId: incomeCategoryId,
      assetId,
    });
  }

  async unitMove(db: Db, userId: string, dto: UnitMoveDto, ctx: PostContext): Promise<PostedTransaction> {
    const asset = await this.assetOf(db, userId, dto.assetId);
    const units = toUnits(dto.units);
    const lines = this.movements.build(() =>
      unitMoveLines({ fromAccountId: dto.fromAccountId, toAccountId: dto.toAccountId, assetId: asset.commodityId, units }),
    );
    const tx = await this.ledger.post(db, userId, lines, { ...this.movements.opts(dto, ctx), kind: 'unit_move', assetId: asset.commodityId });
    await this.lots.move(db, tx, { accountId: dto.fromAccountId, method: await this.methodOf(db, userId, dto.fromAccountId) }, dto.toAccountId, asset.commodityId, units);
    return tx;
  }

  async split(db: Db, userId: string, dto: SplitDto, ctx: PostContext): Promise<PostedTransaction> {
    const asset = await this.assetOf(db, userId, dto.assetId);
    const from = BigInt(dto.ratioFrom);
    const to = BigInt(dto.ratioTo);
    if (from === 0n || to === 0n || from === to) throw new BadRequestException('a split needs two different positive numbers');
    // the lots are rescaled first; the entries then post exactly what they gained, on the
    // draft being approved or on a placeholder draft
    const date = this.movements.opts(dto, ctx).date;
    const draftId =
      ctx.draftId ??
      (
        await db.moneyTransaction.create({
          data: { userId, date, kind: 'split', status: 'draft', draft: { kind: 'split', input: { ...dto } }, assetId: asset.commodityId, proposedBy: ctx.actor },
        })
      ).id;
    const deltas = await this.lots.split(db, userId, draftId, asset.commodityId, from, to, date);
    const lines = this.movements.build(() =>
      splitLines(
        asset.commodityId,
        [...deltas.entries()].map(([accountId, delta]) => ({ accountId, delta })),
      ),
    );
    return this.ledger.post(db, userId, lines, {
      ...this.movements.opts(dto, ctx),
      kind: 'split',
      assetId: asset.commodityId,
      draftId,
      note: dto.note ?? `Split ${dto.ratioFrom}:${dto.ratioTo}`,
      allowArchived: true,
    });
  }

  async assetOf(db: Db, userId: string, assetId: string): Promise<MoneyAsset & { commodity: MoneyCommodity }> {
    const asset = await db.moneyAsset.findFirst({ where: { commodityId: assetId, commodity: { userId } }, include: { commodity: true } });
    if (!asset) throw new NotFoundException('asset not found');
    return asset;
  }

  private async methodOf(db: Db, userId: string, accountId: string): Promise<CostBasisMethod> {
    const account = await db.moneyAccount.findFirst({ where: { id: accountId, userId } });
    if (!account) throw new NotFoundException('account not found');
    if (account.costBasisMethod) return account.costBasisMethod;
    const settings = await db.moneySettings.findUnique({ where: { userId } });
    return settings?.defaultCostBasis ?? 'fifo';
  }
}

