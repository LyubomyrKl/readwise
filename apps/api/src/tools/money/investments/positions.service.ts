import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '@platform/config/env.validation';
import { PrismaService } from '@platform/db/prisma.service';
import { BalancesService } from '../accounts/balances.service';
import { amountJson, unitsJson, type AmountJson } from '../common/amounts';
import { divRound, formatScaled, pow10 } from '../core/decimal';
import { formatDate, todayIn } from '../core/dates';
import { quantityFromDb } from '../core/quantity';
import { CommoditiesService } from '../reference/commodities.service';
import { LotResponse, LotsQuery, PositionResponse } from './investment.models';
import { LotsService } from './lots.service';
import { ValuationService, type AssetWithCommodity } from './valuation.service';

export interface Holding {
  accountId: string;
  accountName: string;
  accountType: string;
  cashClassId: string | null;
  asset: AssetWithCommodity;
  units: bigint;
  /** cost of the units held, by the currency paid */
  cost: Map<string, bigint>;
  /** units of the lots behind each of those costs */
  costUnits: Map<string, bigint>;
  lots: { acquiredAt: Date; units: bigint }[];
}

/** Holdings: units from the ledger, cost from the lots, value from prices or the bond formula. */
@Injectable()
export class PositionsService {
  private readonly timeZone: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly balances: BalancesService,
    private readonly lots: LotsService,
    private readonly valuation: ValuationService,
    private readonly commodities: CommoditiesService,
    config: ConfigService<EnvironmentVariables>,
  ) {
    this.timeZone = config.get('MONEY_TIMEZONE', { infer: true }) ?? 'Europe/Warsaw';
  }

  /** Every (account, asset) with units at the end of `at`. */
  async holdings(userId: string, at: Date, accountId?: string): Promise<Holding[]> {
    const totals = await this.balances.subAccountTotals(userId, { asOf: at, accountIds: accountId ? [accountId] : undefined });
    const held = totals.filter((t) => t.units !== 0n);
    if (held.length === 0) return [];
    const assets = await this.prisma.moneyAsset.findMany({
      where: { commodityId: { in: [...new Set(held.map((h) => h.commodityId))] }, commodity: { userId } },
      include: { commodity: true },
    });
    const accounts = await this.prisma.moneyAccount.findMany({ where: { id: { in: [...new Set(held.map((h) => h.accountId))] } } });
    const lots = await this.lots.lotsAt(this.prisma, userId, at, { accountId });
    const out: Holding[] = [];
    for (const h of held) {
      const asset = assets.find((a) => a.commodityId === h.commodityId);
      const account = accounts.find((a) => a.id === h.accountId);
      if (!asset || !account) continue;
      const mine = lots.filter((l) => l.lot.accountId === h.accountId && l.lot.assetId === h.commodityId && l.units > 0n);
      const cost = new Map<string, bigint>();
      const costUnits = new Map<string, bigint>();
      for (const l of mine) {
        cost.set(l.lot.costCurrencyId, (cost.get(l.lot.costCurrencyId) ?? 0n) + l.cost);
        costUnits.set(l.lot.costCurrencyId, (costUnits.get(l.lot.costCurrencyId) ?? 0n) + l.units);
      }
      out.push({
        accountId: account.id,
        accountName: account.name,
        accountType: account.type,
        cashClassId: account.cashClassId,
        asset,
        units: h.units,
        cost,
        costUnits,
        lots: mine.map((l) => ({ acquiredAt: l.lot.acquiredAt, units: l.units })),
      });
    }
    return out;
  }

  async positions(userId: string, opts: { accountId?: string; asOf?: Date } = {}): Promise<PositionResponse[]> {
    const at = opts.asOf ?? todayIn(this.timeZone);
    const holdings = await this.holdings(userId, at, opts.accountId);
    const out: PositionResponse[] = [];
    for (const h of holdings) {
      const v = await this.valuation.value(h.asset, h.units, h.lots, at);
      const costs = await Promise.all(
        [...h.cost.entries()].map(async ([currency, minor]) => amountJson(minor, currency, await this.commodities.decimalsOf(currency))),
      );
      let averageCost: string | null = null;
      let gain: AmountJson | null = null;
      let gainPercent: string | null = null;
      if (h.cost.size === 1 && h.units > 0n) {
        const [currency, costMinor] = [...h.cost.entries()][0];
        const decimals = await this.commodities.decimalsOf(currency);
        averageCost = formatScaled(divRound(costMinor * pow10(10) * pow10(4), h.units * pow10(decimals)), 4);
        if (v.value !== null && v.currency === currency) {
          const diff = v.value - costMinor;
          gain = amountJson(diff, currency, decimals);
          if (costMinor > 0n) gainPercent = formatScaled(divRound(diff * 1000n, costMinor), 1);
        }
      }
      out.push({
        accountId: h.accountId,
        accountName: h.accountName,
        assetId: h.asset.commodityId,
        code: h.asset.commodity.code,
        name: h.asset.commodity.name,
        unitName: h.asset.unitName,
        units: unitsJson(h.units),
        cost: costs,
        averageCost,
        price: v.price,
        value: v.value === null ? null : amountJson(v.value, v.currency, await this.commodities.decimalsOf(v.currency)),
        gain,
        gainPercent,
        valuedBy: v.valuedBy === 'none' ? (h.cost.size > 0 ? 'cost' : 'none') : v.valuedBy,
        estimated: v.estimated,
        lots: h.lots.length,
      });
    }
    return out.sort((a, b) => a.accountName.localeCompare(b.accountName) || a.code.localeCompare(b.code));
  }

  async lotList(userId: string, query: LotsQuery): Promise<LotResponse[]> {
    const rows = await this.prisma.moneyLot.findMany({
      where: {
        account: { userId },
        reversedAt: null,
        ...(query.accountId ? { accountId: query.accountId } : {}),
        ...(query.assetId ? { assetId: query.assetId } : {}),
        ...(query.open === 'true' ? { remainingUnits: { gt: 0 } } : {}),
      },
      orderBy: [{ acquiredAt: 'asc' }, { createdAt: 'asc' }],
      take: 2000,
    });
    const out: LotResponse[] = [];
    const plnDecimals = await this.commodities.decimalsOf('PLN');
    for (const r of rows) {
      const decimals = await this.commodities.decimalsOf(r.costCurrencyId);
      out.push({
        id: r.id,
        accountId: r.accountId,
        assetId: r.assetId,
        acquiredAt: formatDate(r.acquiredAt),
        units: unitsJson(quantityFromDb(r.units)),
        remainingUnits: unitsJson(quantityFromDb(r.remainingUnits)),
        cost: amountJson(r.costMinor, r.costCurrencyId, decimals),
        remainingCost: amountJson(r.remainingCostMinor, r.costCurrencyId, decimals),
        costPln: r.costPlnMinor === null ? null : amountJson(r.costPlnMinor, 'PLN', plnDecimals),
        costPlnRate: r.costPlnRate?.toFixed() ?? null,
        costPlnRateDate: r.costPlnRateDate ? formatDate(r.costPlnRateDate) : null,
        tradeCost:
          r.tradeCostMinor !== null && r.tradeCurrencyId
            ? amountJson(r.tradeCostMinor, r.tradeCurrencyId, await this.commodities.decimalsOf(r.tradeCurrencyId))
            : null,
        transactionId: r.transactionId,
        parentLotId: r.parentLotId,
        closed: quantityFromDb(r.remainingUnits) === 0n,
      });
    }
    return out;
  }
}
