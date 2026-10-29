import { BadRequestException, Injectable } from '@nestjs/common';
import type { MoneyLot, MoneyLotConsumptionKind } from '@prisma/client';
import { PrismaService } from '@platform/db/prisma.service';
import type { Db } from '../common/db';
import { formatDate } from '../core/dates';
import { consumeLots, costShare, LotError, splitUnits, type CostBasisMethod, type OpenLot, type Take } from '../core/lots';
import { quantityFromDb, quantityToDb } from '../core/quantity';
import { AuditService } from '../ledger/audit.service';
import type { PostedTransaction } from '../ledger/ledger.service';
import { CommoditiesService } from '../reference/commodities.service';
import { RatesService } from '../rates/rates.service';
import type { ReversalHook } from '../transactions/transactions.service';

export interface OpenLotInput {
  accountId: string;
  assetId: string;
  transactionId: string;
  openingEntryId: string;
  units: bigint;
  costMinor: bigint;
  costCurrency: string;
  acquiredAt: Date;
  tradeCostMinor?: bigint | null;
  tradeCurrency?: string | null;
  parentLotId?: string | null;
  /** carried over from the parent of a moved lot */
  costPln?: { minor: bigint; rate: string | null; rateDate: Date | null } | null;
}

interface SplitRecord {
  /** each lot before the split, and after it */
  lots: { id: string; units: string; remainingUnits: string; splitUnits: string; splitRemainingUnits: string }[];
}

/**
 * Lots: opened by buys and unit moves, taken from by sales and unit moves
 * (FIFO or average cost, core/lots.ts), rescaled by splits, and put back when
 * one of those is reversed. Always inside the database transaction that posts
 * the movement, so the ledger and the lots never disagree.
 */
@Injectable()
export class LotsService implements ReversalHook {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rates: RatesService,
    private readonly commodities: CommoditiesService,
    private readonly audit: AuditService,
  ) {}

  async open(db: Db, input: OpenLotInput): Promise<MoneyLot> {
    let costPln = input.costPln ?? null;
    if (!costPln) {
      const decimals = await this.commodities.decimalsOf(input.costCurrency);
      const pln = await this.rates.toPlnForTax(db, input.costMinor, input.costCurrency, decimals, input.acquiredAt);
      if (pln) costPln = { minor: pln.minor, rate: pln.rate, rateDate: pln.rateDate };
    }
    return db.moneyLot.create({
      data: {
        accountId: input.accountId,
        assetId: input.assetId,
        transactionId: input.transactionId,
        openingEntryId: input.openingEntryId,
        parentLotId: input.parentLotId ?? null,
        units: quantityToDb(input.units),
        remainingUnits: quantityToDb(input.units),
        costMinor: input.costMinor,
        remainingCostMinor: input.costMinor,
        costCurrencyId: input.costCurrency,
        tradeCostMinor: input.tradeCostMinor ?? null,
        tradeCurrencyId: input.tradeCurrency ?? null,
        costPlnMinor: costPln?.minor ?? null,
        costPlnRate: costPln?.rate ?? null,
        costPlnRateDate: costPln?.rateDate ?? null,
        acquiredAt: input.acquiredAt,
      },
    });
  }

  /** Lots with units left; with `asOf`, only lots that existed by then (a back-dated sale cannot take later lots). */
  async openLots(db: Db | PrismaService, accountId: string, assetId: string, asOf?: Date): Promise<(OpenLot & { row: MoneyLot })[]> {
    const rows = await db.moneyLot.findMany({
      where: {
        accountId,
        assetId,
        reversedAt: null,
        remainingUnits: { gt: 0 },
        ...(asOf ? { acquiredAt: { lte: asOf }, transaction: { date: { lte: asOf } } } : {}),
      },
      orderBy: [{ acquiredAt: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((row, i) => ({
      id: row.id,
      acquiredAt: formatDate(row.acquiredAt),
      sequence: i,
      units: quantityFromDb(row.units),
      remainingUnits: quantityFromDb(row.remainingUnits),
      remainingCostMinor: row.remainingCostMinor,
      costCurrency: row.costCurrencyId,
      row,
    }));
  }

  /** Takes units out of the account's lots for a sale or a move and records each take. */
  async consume(
    db: Db,
    transactionId: string,
    accountId: string,
    assetId: string,
    units: bigint,
    method: CostBasisMethod,
    kind: MoneyLotConsumptionKind,
    asOf: Date,
  ): Promise<(Take & { lot: MoneyLot })[]> {
    // FIFO is a story told in date order: a take may not go back before an earlier take
    const latest = await db.moneyLotConsumption.findFirst({
      where: { reversedAt: null, lot: { accountId, assetId }, transaction: { date: { gt: asOf } } },
      include: { transaction: { select: { date: true } } },
      orderBy: { transaction: { date: 'desc' } },
    });
    if (latest) {
      throw new BadRequestException(
        `a later sale or move of this asset (${formatDate(latest.transaction.date)}) already took from these lots; date this one on or after it, or reverse the later one first`,
      );
    }
    const lots = await this.openLots(db, accountId, assetId, asOf);
    let takes: Take[];
    try {
      takes = consumeLots(lots, units, method);
    } catch (error) {
      if (error instanceof LotError) throw new BadRequestException(error.message);
      throw error;
    }
    const out: (Take & { lot: MoneyLot })[] = [];
    for (const take of takes) {
      const lot = lots.find((l) => l.id === take.lotId)!;
      await db.moneyLotConsumption.create({
        data: {
          lotId: take.lotId,
          transactionId,
          kind,
          units: quantityToDb(take.units),
          costAllocatedMinor: take.costMinor,
        },
      });
      const updated = await db.moneyLot.update({
        where: { id: take.lotId },
        data: {
          remainingUnits: quantityToDb(lot.remainingUnits - take.units),
          remainingCostMinor: lot.remainingCostMinor - take.costMinor,
        },
      });
      out.push({ ...take, lot: updated });
    }
    return out;
  }

  /** Moves units with their cost and acquisition dates to another account. */
  async move(
    db: Db,
    tx: PostedTransaction,
    from: { accountId: string; method: CostBasisMethod },
    toAccountId: string,
    assetId: string,
    units: bigint,
  ): Promise<void> {
    const entry = tx.entries.find(
      (e) => e.subAccount.accountId === toAccountId && e.subAccount.commodityId === assetId && e.quantity !== null && quantityFromDb(e.quantity) > 0n,
    );
    if (!entry) throw new Error('unit move without the receiving entry');
    const takes = await this.consume(db, tx.id, from.accountId, assetId, units, from.method, 'move', tx.date);
    for (const take of takes) {
      const parent = take.lot;
      const parentCost = parent.costMinor;
      const pln =
        parent.costPlnMinor !== null && parentCost > 0n
          ? { minor: costShare(parent.costPlnMinor, take.costMinor, parentCost), rate: parent.costPlnRate?.toFixed() ?? null, rateDate: parent.costPlnRateDate }
          : null;
      await this.open(db, {
        accountId: toAccountId,
        assetId,
        transactionId: tx.id,
        openingEntryId: entry.id,
        units: take.units,
        costMinor: take.costMinor,
        costCurrency: take.costCurrency,
        acquiredAt: parent.acquiredAt,
        tradeCostMinor: parent.tradeCostMinor !== null && parentCost > 0n ? costShare(parent.tradeCostMinor, take.costMinor, parentCost) : null,
        tradeCurrency: parent.tradeCurrencyId,
        parentLotId: parent.id,
        costPln: pln,
      });
    }
  }

  /**
   * Rescales every open lot of the asset (all accounts): units times to/from,
   * cost unchanged. Returns how many units each account gained (or lost).
   * The lots as they were are kept in the audit log for a reversal.
   */
  async split(db: Db, userId: string, transactionId: string, assetId: string, from: bigint, to: bigint, date: Date): Promise<Map<string, bigint>> {
    // the split rescales what was held on its day; a later trade was already in the new units
    const later = await db.moneyLot.findFirst({
      where: {
        assetId,
        reversedAt: null,
        account: { userId },
        OR: [
          { acquiredAt: { gt: date } },
          { transaction: { date: { gt: date } } },
          { consumptions: { some: { reversedAt: null, transaction: { date: { gt: date } } } } },
        ],
      },
    });
    if (later) {
      throw new BadRequestException('this asset was bought, sold or moved after the split date; date the split after those, or reverse them first');
    }
    const lots = await db.moneyLot.findMany({
      where: { assetId, reversedAt: null, remainingUnits: { gt: 0 }, account: { userId } },
    });
    const deltas = new Map<string, bigint>();
    const record: SplitRecord = { lots: [] };
    for (const lot of lots) {
      const units = quantityFromDb(lot.units);
      const remaining = quantityFromDb(lot.remainingUnits);
      const newUnits = splitUnits(units, from, to);
      const newRemaining = splitUnits(remaining, from, to);
      record.lots.push({
        id: lot.id,
        units: quantityToDb(units),
        remainingUnits: quantityToDb(remaining),
        splitUnits: quantityToDb(newUnits),
        splitRemainingUnits: quantityToDb(newRemaining),
      });
      deltas.set(lot.accountId, (deltas.get(lot.accountId) ?? 0n) + newRemaining - remaining);
      await db.moneyLot.update({
        where: { id: lot.id },
        data: { units: quantityToDb(newUnits), remainingUnits: quantityToDb(newRemaining) },
      });
    }
    await this.audit.record(db, { userId, actor: 'system', action: 'lots.split', subjectId: transactionId, details: { ...record } });
    return deltas;
  }

  /** Undoes what a buy, sale, unit move or split did to the lots; called inside the reversal's transaction. */
  async reverse(db: Db, userId: string, original: PostedTransaction): Promise<void> {
    const now = new Date();
    if (original.kind !== 'split' && original.assetId) {
      // its units were rescaled since: what it took or opened is no longer in the units of the lots
      const split = await db.moneyTransaction.findFirst({
        where: {
          userId,
          kind: 'split',
          status: 'posted',
          assetId: original.assetId,
          postedAt: { gt: original.postedAt ?? original.createdAt },
          correctedBy: { none: { kind: 'correction' } },
        },
      });
      if (split) throw new BadRequestException(`this asset was split since (${formatDate(split.date)}); reverse the split first`);
    }
    if (original.kind === 'buy' || original.kind === 'unit_move') {
      const opened = await db.moneyLot.findMany({ where: { transactionId: original.id, reversedAt: null } });
      for (const lot of opened) {
        if (quantityFromDb(lot.remainingUnits) !== quantityFromDb(lot.units)) {
          throw new BadRequestException('units of this lot were sold or moved since; reverse those first');
        }
        await db.moneyLot.update({ where: { id: lot.id }, data: { remainingUnits: 0, remainingCostMinor: 0n, reversedAt: now } });
      }
    }
    if (original.kind === 'sell' || original.kind === 'unit_move') {
      const taken = await db.moneyLotConsumption.findMany({ where: { transactionId: original.id, reversedAt: null } });
      for (const c of taken) {
        const lot = await db.moneyLot.findUniqueOrThrow({ where: { id: c.lotId } });
        await db.moneyLot.update({
          where: { id: lot.id },
          data: {
            remainingUnits: quantityToDb(quantityFromDb(lot.remainingUnits) + quantityFromDb(c.units)),
            remainingCostMinor: lot.remainingCostMinor + c.costAllocatedMinor,
          },
        });
        await db.moneyLotConsumption.update({ where: { id: c.id }, data: { reversedAt: now } });
      }
    }
    if (original.kind === 'split') {
      const log = await db.moneyAuditLog.findFirst({ where: { userId, action: 'lots.split', subjectId: original.id } });
      const record = log?.details as unknown as SplitRecord | null;
      if (!record) throw new BadRequestException('the lots before this split are not on record');
      for (const l of record.lots) {
        const lot = await db.moneyLot.findUniqueOrThrow({ where: { id: l.id } });
        if (lot.reversedAt || quantityFromDb(lot.units) !== quantityFromDb(l.splitUnits) || quantityFromDb(lot.remainingUnits) !== quantityFromDb(l.splitRemainingUnits)) {
          throw new BadRequestException('units of this asset were sold, moved or reversed after the split; reverse those first');
        }
        await db.moneyLot.update({ where: { id: l.id }, data: { units: l.units, remainingUnits: l.remainingUnits } });
      }
    }
  }

  /** Lots of an account and asset with the units each held at the end of `at` (consumptions after it put back). */
  async lotsAt(db: Db | PrismaService, userId: string, at: Date, filter: { accountId?: string; assetId?: string } = {}) {
    const lots = await db.moneyLot.findMany({
      where: {
        account: { userId },
        acquiredAt: { lte: at },
        reversedAt: null,
        ...(filter.accountId ? { accountId: filter.accountId } : {}),
        ...(filter.assetId ? { assetId: filter.assetId } : {}),
        transaction: { date: { lte: at } },
      },
      include: {
        consumptions: { where: { reversedAt: null }, include: { transaction: { select: { date: true } } } },
      },
    });
    return lots.map((lot) => {
      let units = quantityFromDb(lot.remainingUnits);
      let cost = lot.remainingCostMinor;
      for (const c of lot.consumptions) {
        if (c.transaction.date > at) {
          units += quantityFromDb(c.units);
          cost += c.costAllocatedMinor;
        }
      }
      return { lot, units, cost };
    });
  }
}
