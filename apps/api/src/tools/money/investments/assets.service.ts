import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type MoneyAsset, type MoneyAssetClass, type MoneyAllocationTarget, type MoneyAssetClassSplit, type MoneyCommodity } from '@prisma/client';
import { PrismaService } from '@platform/db/prisma.service';
import { toDate } from '../common/parse';
import { BondConfigError, parseBondConfig } from '../core/bonds';
import { formatDate } from '../core/dates';
import { toFraction } from '../core/decimal';
import { AuditService } from '../ledger/audit.service';
import { jsonInput, LedgerService } from '../ledger/ledger.service';
import { CommoditiesService } from '../reference/commodities.service';
import {
  AssetClassResponse,
  AssetResponse,
  ClassShareDto,
  CreateAssetClassDto,
  CreateAssetDto,
  TargetDto,
  UpdateAssetClassDto,
  UpdateAssetDto,
} from './investment.models';
import { ValuationService } from './valuation.service';

type AssetRow = MoneyAsset & { commodity: MoneyCommodity; classSplits: MoneyAssetClassSplit[] };

/** Percent strings compared exactly, as hundredths of a percent times 100. */
function percentUnits(p: string): bigint {
  const [n, d] = toFraction(p.replace(',', '.'));
  return (n * 10_000n) / d;
}

/**
 * Assets (any instrument: name, code, quote currency, how it is valued),
 * asset classes with target percentages kept as history, and how each asset
 * splits across classes. Nothing about a particular fund or bond is code.
 */
@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly commodities: CommoditiesService,
    private readonly valuation: ValuationService,
    private readonly audit: AuditService,
  ) {}

  async list(userId: string, includeArchived = false): Promise<AssetResponse[]> {
    const rows = await this.prisma.moneyAsset.findMany({
      where: { commodity: { userId }, ...(includeArchived ? {} : { archivedAt: null }) },
      include: { commodity: true, classSplits: true },
      orderBy: { commodity: { code: 'asc' } },
    });
    return Promise.all(rows.map((r) => this.present(r)));
  }

  async get(userId: string, id: string): Promise<AssetResponse> {
    return this.present(await this.assetOf(userId, id));
  }

  async create(userId: string, dto: CreateAssetDto, actor = 'user'): Promise<AssetResponse> {
    await this.ledger.ensureSetup(userId);
    const quote = await this.commodities.currency(dto.quoteCurrency);
    this.checkValuation(dto.valuation ?? 'manual', dto.valuationConfig);
    const code = dto.code.trim().toUpperCase();
    const clash = await this.prisma.moneyCommodity.findFirst({ where: { userId, kind: 'asset', code } });
    if (clash) throw new ConflictException(`an asset with the code ${code} exists`);
    if (dto.classes) await this.checkShares(userId, dto.classes);
    const id = await this.prisma.$transaction(async (db) => {
      const commodity = await db.moneyCommodity.create({
        data: { kind: 'asset', code, name: dto.name.trim(), decimals: 4, userId },
      });
      await db.moneyAsset.create({
        data: {
          commodityId: commodity.id,
          ticker: dto.ticker?.trim() || null,
          isin: dto.isin ?? null,
          unitName: dto.unitName?.trim() || 'units',
          quoteCurrencyId: quote.id,
          valuation: dto.valuation ?? 'manual',
          valuationConfig: dto.valuationConfig ? jsonInput(dto.valuationConfig) : undefined,
        },
      });
      for (const share of dto.classes ?? []) {
        await db.moneyAssetClassSplit.create({ data: { assetId: commodity.id, classId: share.classId, percent: share.percent.replace(',', '.') } });
      }
      await this.audit.record(db, { userId, actor, action: 'asset.create', subjectId: commodity.id, details: { code } });
      return commodity.id;
    });
    return this.get(userId, id);
  }

  async update(userId: string, id: string, dto: UpdateAssetDto, actor = 'user'): Promise<AssetResponse> {
    const asset = await this.assetOf(userId, id);
    const valuation = dto.valuation ?? asset.valuation;
    const config = dto.valuationConfig === undefined ? asset.valuationConfig : dto.valuationConfig;
    this.checkValuation(valuation, config);
    await this.prisma.$transaction(async (db) => {
      if (dto.code || dto.name) {
        await db.moneyCommodity.update({
          where: { id },
          data: { code: dto.code?.trim().toUpperCase(), name: dto.name?.trim() },
        });
      }
      await db.moneyAsset.update({
        where: { commodityId: id },
        data: {
          unitName: dto.unitName?.trim(),
          isin: dto.isin === undefined ? undefined : dto.isin,
          ticker: dto.ticker === undefined ? undefined : dto.ticker?.trim() || null,
          valuation: dto.valuation,
          valuationConfig: dto.valuationConfig === undefined ? undefined : dto.valuationConfig === null ? Prisma.DbNull : jsonInput(dto.valuationConfig),
          archivedAt: dto.archived === undefined ? undefined : dto.archived ? new Date() : null,
        },
      });
      await this.audit.record(db, { userId, actor, action: 'asset.update', subjectId: id, details: { ...dto } });
    });
    return this.get(userId, id);
  }

  async setShares(userId: string, id: string, shares: ClassShareDto[], actor = 'user'): Promise<AssetResponse> {
    await this.assetOf(userId, id);
    await this.checkShares(userId, shares);
    await this.prisma.$transaction(async (db) => {
      await db.moneyAssetClassSplit.deleteMany({ where: { assetId: id } });
      for (const share of shares) {
        await db.moneyAssetClassSplit.create({ data: { assetId: id, classId: share.classId, percent: share.percent.replace(',', '.') } });
      }
      await this.audit.record(db, { userId, actor, action: 'asset.classes', subjectId: id, details: { shares } });
    });
    return this.get(userId, id);
  }

  // ---- classes ----------------------------------------------------------------------------

  async listClasses(userId: string): Promise<AssetClassResponse[]> {
    const rows = await this.prisma.moneyAssetClass.findMany({
      where: { userId },
      include: { targets: { orderBy: { validFrom: 'desc' } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map((r) => presentClass(r));
  }

  async createClass(userId: string, dto: CreateAssetClassDto, actor = 'user'): Promise<AssetClassResponse> {
    await this.ledger.ensureSetup(userId);
    try {
      const row = await this.prisma.$transaction(async (db) => {
        const created = await db.moneyAssetClass.create({ data: { userId, name: dto.name.trim(), sortOrder: dto.sortOrder ?? 0 } });
        if (dto.targetPercent) {
          await db.moneyAllocationTarget.create({
            data: { classId: created.id, percent: dto.targetPercent.replace(',', '.'), validFrom: new Date(Date.UTC(2000, 0, 1)) },
          });
        }
        await this.audit.record(db, { userId, actor, action: 'class.create', subjectId: created.id, details: { name: created.name } });
        return created;
      });
      await this.checkTargetsTotal(userId);
      return (await this.listClasses(userId)).find((c) => c.id === row.id)!;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`a class named ${dto.name} exists`);
      }
      throw error;
    }
  }

  async updateClass(userId: string, id: string, dto: UpdateAssetClassDto, actor = 'user'): Promise<AssetClassResponse> {
    await this.classOf(userId, id);
    await this.prisma.$transaction(async (db) => {
      await db.moneyAssetClass.update({ where: { id }, data: { name: dto.name?.trim(), sortOrder: dto.sortOrder } });
      await this.audit.record(db, { userId, actor, action: 'class.update', subjectId: id, details: { ...dto } });
    });
    return (await this.listClasses(userId)).find((c) => c.id === id)!;
  }

  /** A new target from a day on; earlier targets stay as history. */
  async setTarget(userId: string, id: string, dto: TargetDto, actor = 'user'): Promise<AssetClassResponse> {
    await this.classOf(userId, id);
    const validFrom = toDate(dto.validFrom, 'validFrom');
    const percent = dto.percent.replace(',', '.');
    if (percentUnits(percent) > 1_000_000n) throw new BadRequestException('a target is at most 100%');
    await this.prisma.$transaction(async (db) => {
      await db.moneyAllocationTarget.upsert({
        where: { classId_validFrom: { classId: id, validFrom } },
        create: { classId: id, percent, validFrom },
        update: { percent },
      });
      await this.audit.record(db, { userId, actor, action: 'class.target', subjectId: id, details: { ...dto } });
    });
    await this.checkTargetsTotal(userId);
    return (await this.listClasses(userId)).find((c) => c.id === id)!;
  }

  // ---- internals ----------------------------------------------------------------------------

  async assetOf(userId: string, id: string): Promise<AssetRow> {
    const row = await this.prisma.moneyAsset.findFirst({
      where: { commodityId: id, commodity: { userId } },
      include: { commodity: true, classSplits: true },
    });
    if (!row) throw new NotFoundException('asset not found');
    return row;
  }

  private async classOf(userId: string, id: string): Promise<MoneyAssetClass> {
    const row = await this.prisma.moneyAssetClass.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException('asset class not found');
    return row;
  }

  private checkValuation(valuation: string, config: unknown): void {
    if (valuation === 'bond_formula') {
      try {
        parseBondConfig(config);
      } catch (error) {
        throw new BadRequestException(`bond formula: ${error instanceof BondConfigError ? error.message : String(error)}`);
      }
    }
    if (valuation === 'price_feed') {
      const c = config as { symbol?: unknown } | null | undefined;
      if (!c || typeof c.symbol !== 'string' || !c.symbol.trim()) {
        throw new BadRequestException('price feed: valuationConfig needs { "provider": "stooq", "symbol": "vwce.de" }');
      }
    }
  }

  private async checkShares(userId: string, shares: ClassShareDto[]): Promise<void> {
    let total = 0n;
    for (const share of shares) {
      await this.classOf(userId, share.classId);
      const p = percentUnits(share.percent);
      if (p <= 0n) throw new BadRequestException('a class share is more than 0%');
      total += p;
    }
    if (total > 1_000_000n) throw new BadRequestException('class shares add up to more than 100%');
    if (new Set(shares.map((s) => s.classId)).size !== shares.length) throw new BadRequestException('a class appears twice');
  }

  /** Current targets may not exceed 100% together. */
  private async checkTargetsTotal(userId: string): Promise<void> {
    const classes = await this.listClasses(userId);
    const total = classes.reduce((sum, c) => sum + (c.targetPercent ? percentUnits(c.targetPercent) : 0n), 0n);
    if (total > 1_000_000n) {
      throw new BadRequestException('the current targets add up to more than 100%; lower another class first');
    }
  }

  private async present(row: AssetRow): Promise<AssetResponse> {
    return {
      id: row.commodityId,
      code: row.commodity.code,
      name: row.commodity.name,
      ticker: row.ticker,
      isin: row.isin,
      unitName: row.unitName,
      quoteCurrency: row.quoteCurrencyId,
      valuation: row.valuation,
      valuationConfig: row.valuationConfig,
      classes: row.classSplits.map((s) => ({ classId: s.classId, percent: s.percent.toFixed() })),
      latestPrice: await this.valuation.latestPrice(this.prisma, row.commodityId, new Date(Date.UTC(9999, 0, 1))),
      archived: row.archivedAt !== null,
    };
  }
}

export function presentClass(row: MoneyAssetClass & { targets: MoneyAllocationTarget[] }, at: Date = new Date()): AssetClassResponse {
  const current = row.targets.filter((t) => t.validFrom <= at).sort((a, b) => b.validFrom.getTime() - a.validFrom.getTime())[0];
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sortOrder,
    targetPercent: current ? current.percent.toFixed() : null,
    targetValidFrom: current ? formatDate(current.validFrom) : null,
    targets: row.targets.map((t) => ({ percent: t.percent.toFixed(), validFrom: formatDate(t.validFrom) })),
  };
}
