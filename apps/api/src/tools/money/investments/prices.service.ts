import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { MoneyPriceSource } from '@prisma/client';
import { PrismaService } from '@platform/db/prisma.service';
import { toDate } from '../common/parse';
import { formatDate } from '../core/dates';
import { AuditService } from '../ledger/audit.service';
import { CreatePriceDto, PriceResponse } from './investment.models';

/** One price table: manual entries, imported files and the price feed all write here. */
@Injectable()
export class PricesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(userId: string, assetId: string | undefined, limit = 200): Promise<PriceResponse[]> {
    await this.assetOf(userId, assetId);
    const rows = await this.prisma.moneyPrice.findMany({
      where: { assetId },
      orderBy: [{ date: 'desc' }, { source: 'asc' }],
      take: Math.min(limit, 2000),
    });
    return rows.map((r) => ({
      id: r.id,
      assetId: r.assetId,
      date: formatDate(r.date),
      price: r.price.toFixed(),
      currency: r.quoteCurrencyId,
      source: r.source,
    }));
  }

  /** Records a price for a day; a second price from the same source on that day replaces the first. */
  async record(userId: string, dto: CreatePriceDto, source: MoneyPriceSource = 'manual', actor = 'user'): Promise<PriceResponse> {
    const asset = await this.assetOf(userId, dto.assetId);
    const date = toDate(dto.date);
    const price = dto.price.replace(',', '.');
    if (!/^\d+(\.\d{1,10})?$/.test(price)) throw new BadRequestException('price: up to 10 decimal places');
    const row = await this.prisma.$transaction(async (db) => {
      const saved = await db.moneyPrice.upsert({
        where: { assetId_date_source: { assetId: asset.commodityId, date, source } },
        create: { assetId: asset.commodityId, date, price, quoteCurrencyId: asset.quoteCurrencyId, source },
        update: { price },
      });
      await this.audit.record(db, { userId, actor, action: 'price.record', subjectId: asset.commodityId, details: { date: dto.date, price, source } });
      return saved;
    });
    return { id: row.id, assetId: row.assetId, date: formatDate(row.date), price: row.price.toFixed(), currency: row.quoteCurrencyId, source: row.source };
  }

  async remove(userId: string, id: string, actor = 'user'): Promise<{ removed: true }> {
    const row = await this.prisma.moneyPrice.findFirst({ where: { id, asset: { commodity: { userId } } } });
    if (!row) throw new NotFoundException('price not found');
    await this.prisma.$transaction(async (db) => {
      await db.moneyPrice.delete({ where: { id } });
      await this.audit.record(db, { userId, actor, action: 'price.remove', subjectId: row.assetId, details: { date: formatDate(row.date) } });
    });
    return { removed: true };
  }

  private async assetOf(userId: string, assetId: string | undefined) {
    // an undefined id would match every asset (and list the prices of all of them)
    if (!assetId) throw new BadRequestException('assetId: required');
    const asset = await this.prisma.moneyAsset.findFirst({ where: { commodityId: assetId, commodity: { userId } } });
    if (!asset) throw new NotFoundException('asset not found');
    return asset;
  }
}
