import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@platform/db/prisma.service';
import { amountJson, unitsJson } from '../common/amounts';
import { formatDate } from '../core/dates';
import { costShare } from '../core/lots';
import { quantityFromDb } from '../core/quantity';
import { dividendTax, gainsTax, roundToZloty } from '../core/tax';
import { RatesService } from '../rates/rates.service';
import { CommoditiesService } from '../reference/commodities.service';
import { TaxIncome, TaxLotLine, TaxReportResponse, TaxSale } from './tax.models';

const PLN = 'PLN';

/**
 * The yearly return for investments (Polish PIT-38), from the lots: each sale
 * at the NBP rate of the business day before it, against the PLN cost of the
 * lots it took (the rate of the business day before each buy, fixed when the
 * lot opened); dividends and interest at the rate before the payment, with the
 * tax withheld abroad. Taxable investment accounts only: bonds and bank
 * interest are taxed at source.
 */
@Injectable()
export class TaxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rates: RatesService,
    private readonly commodities: CommoditiesService,
  ) {}

  async report(userId: string, year: number): Promise<TaxReportResponse> {
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new BadRequestException('year: 2000 to 2100');
    const from = new Date(Date.UTC(year, 0, 1));
    const to = new Date(Date.UTC(year, 11, 31));
    const accounts = await this.prisma.moneyAccount.findMany({
      where: { userId, type: 'investment', taxWrapper: 'taxable' },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
    const accountIds = accounts.map((a) => a.id);
    const nameOf = new Map(accounts.map((a) => [a.id, a.name]));
    const missing: string[] = [];

    // ---- sales
    const consumptions = await this.prisma.moneyLotConsumption.findMany({
      where: {
        kind: 'sale',
        reversedAt: null,
        lot: { accountId: { in: accountIds } },
        transaction: { userId, status: 'posted', date: { gte: from, lte: to } },
      },
      include: {
        lot: { include: { asset: { include: { commodity: true } } } },
        transaction: { include: { entries: { include: { subAccount: { include: { account: true } } } } } },
      },
      orderBy: [{ transaction: { date: 'asc' } }, { createdAt: 'asc' }],
    });
    const byTx = new Map<string, typeof consumptions>();
    for (const c of consumptions) byTx.set(c.transactionId, [...(byTx.get(c.transactionId) ?? []), c]);

    const sales: TaxSale[] = [];
    let revenue = 0n;
    let costs = 0n;
    for (const list of byTx.values()) {
      const tx = list[0].transaction;
      const asset = list[0].lot.asset;
      const cash = tx.entries.find((e) => e.amountMinor !== null && e.amountMinor > 0n && e.subAccount.account.type !== 'system');
      if (!cash) continue;
      const currency = cash.subAccount.commodityId;
      const decimals = await this.commodities.decimalsOf(currency);
      const proceeds = cash.amountMinor!;
      const units = list.reduce((s, c) => s + quantityFromDb(c.units), 0n);
      const pln = await this.rates.toPlnForTax(this.prisma, proceeds, currency, decimals, tx.date);
      if (!pln) missing.push(`no NBP ${currency} rate in the week before ${formatDate(tx.date)} (sale of ${asset.commodity.code})`);

      const lots: TaxLotLine[] = [];
      let costPln: bigint | null = 0n;
      for (const c of list) {
        const lot = c.lot;
        const lotDecimals = await this.commodities.decimalsOf(lot.costCurrencyId);
        const share = lot.costPlnMinor === null || lot.costMinor === 0n ? null : costShare(lot.costPlnMinor, c.costAllocatedMinor, lot.costMinor);
        if (share === null) {
          costPln = null;
          missing.push(`the lot of ${asset.commodity.code} bought ${formatDate(lot.acquiredAt)} has no PLN cost yet (its NBP rate is missing)`);
        } else if (costPln !== null) costPln += share;
        lots.push({
          lotId: lot.id,
          acquiredAt: formatDate(lot.acquiredAt),
          units: unitsJson(quantityFromDb(c.units)),
          cost: amountJson(c.costAllocatedMinor, lot.costCurrencyId, lotDecimals),
          costPln: share === null ? null : amountJson(share, PLN, 2),
          rate: lot.costPlnRate?.toFixed() ?? null,
          rateDate: lot.costPlnRateDate ? formatDate(lot.costPlnRateDate) : null,
        });
      }
      const complete = pln !== null && costPln !== null;
      if (complete) {
        revenue += pln.minor;
        costs += costPln!;
      }
      sales.push({
        transactionId: tx.id,
        date: formatDate(tx.date),
        accountName: nameOf.get(list[0].lot.accountId) ?? '',
        assetCode: asset.commodity.code,
        assetName: asset.commodity.name,
        units: unitsJson(units),
        proceeds: amountJson(proceeds, currency, decimals),
        proceedsPln: pln ? amountJson(pln.minor, PLN, 2) : null,
        rate: pln?.rate ?? null,
        rateDate: pln ? formatDate(pln.rateDate) : null,
        costPln: costPln === null ? null : amountJson(costPln, PLN, 2),
        gainPln: complete ? amountJson(pln.minor - costPln!, PLN, 2) : null,
        lots,
      });
    }

    // ---- dividends and interest
    const incomeTxs = await this.prisma.moneyTransaction.findMany({
      where: {
        userId,
        status: 'posted',
        kind: 'investment_income',
        date: { gte: from, lte: to },
        entries: { some: { subAccount: { accountId: { in: accountIds } } } },
        correctedBy: { none: { kind: 'correction' } },
      },
      include: {
        category: true,
        asset: { include: { commodity: true } },
        entries: { include: { subAccount: { include: { account: true } } } },
      },
      orderBy: { date: 'asc' },
    });
    const income: TaxIncome[] = [];
    let incomeGross = 0n;
    let incomeTaxTotal = 0n;
    let incomeCredit = 0n;
    for (const tx of incomeTxs) {
      const own = tx.entries.find((e) => e.subAccount.account.type !== 'system' && e.amountMinor !== null);
      const incomeLeg = tx.entries.find((e) => e.subAccount.account.systemRole === 'income');
      const taxLeg = tx.entries.find((e) => e.subAccount.account.systemRole === 'expense');
      if (!own || !incomeLeg) continue;
      const currency = own.subAccount.commodityId;
      const decimals = await this.commodities.decimalsOf(currency);
      const gross = -(incomeLeg.amountMinor ?? 0n);
      const withheld = taxLeg?.amountMinor ?? 0n;
      const rate = await this.rates.nbpBefore(this.prisma, currency, tx.date);
      if (!rate) missing.push(`no NBP ${currency} rate in the week before ${formatDate(tx.date)} (${tx.category?.name ?? 'income'})`);
      const toPln = async (minor: bigint) => (await this.rates.toPlnForTax(this.prisma, minor, currency, decimals, tx.date))?.minor ?? null;
      const grossPln = rate ? await toPln(gross) : null;
      const withheldPln = rate ? await toPln(withheld) : null;
      const t = grossPln !== null && withheldPln !== null ? dividendTax(grossPln, withheldPln) : null;
      if (t && grossPln !== null) {
        incomeGross += grossPln;
        incomeTaxTotal += t.tax;
        incomeCredit += t.credit;
      }
      income.push({
        transactionId: tx.id,
        date: formatDate(tx.date),
        accountName: nameOf.get(own.subAccount.accountId) ?? '',
        assetCode: tx.asset?.commodity.code ?? null,
        category: tx.category?.name ?? 'Income',
        gross: amountJson(gross, currency, decimals),
        withheld: amountJson(withheld, currency, decimals),
        grossPln: grossPln === null ? null : amountJson(grossPln, PLN, 2),
        withheldPln: withheldPln === null ? null : amountJson(withheldPln, PLN, 2),
        rate: rate?.rate ?? null,
        rateDate: rate ? formatDate(rate.date) : null,
        taxPln: t ? amountJson(t.tax, PLN, 2) : null,
        creditPln: t ? amountJson(t.credit, PLN, 2) : null,
      });
    }

    const gains = gainsTax(revenue, costs);
    const incomeDue = incomeTaxTotal - incomeCredit;
    const pln = (minor: bigint) => amountJson(minor, PLN, 2);
    return {
      year,
      currency: PLN,
      accounts,
      sales,
      income,
      totals: {
        revenue: pln(revenue),
        costs: pln(costs),
        income: pln(gains.income),
        base: pln(gains.base),
        tax: pln(gains.tax),
        incomeGross: pln(incomeGross),
        incomeTax: pln(incomeTaxTotal),
        incomeCredit: pln(incomeCredit),
        incomeDue: pln(incomeDue > 0n ? roundToZloty(incomeDue) : 0n),
      },
      complete: missing.length === 0,
      missing: [...new Set(missing)],
    };
  }
}
