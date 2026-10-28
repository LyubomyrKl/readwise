import { Injectable } from '@nestjs/common';
import { PrismaService } from '@platform/db/prisma.service';
import { AuditService } from '../ledger/audit.service';
import { LedgerService } from '../ledger/ledger.service';
import { CommoditiesService } from '../reference/commodities.service';
import { MoneySettingsResponse, UpdateMoneySettingsDto } from './settings.models';

@Injectable()
export class MoneySettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly commodities: CommoditiesService,
    private readonly audit: AuditService,
  ) {}

  async get(userId: string): Promise<MoneySettingsResponse> {
    await this.ledger.ensureSetup(userId);
    const s = await this.prisma.moneySettings.findUniqueOrThrow({ where: { userId } });
    return { baseCurrency: s.baseCurrencyId, defaultCostBasis: s.defaultCostBasis, taxResidence: s.taxResidence };
  }

  /** Switching the base currency changes how totals are shown, never what is stored (rule 5). */
  async update(userId: string, dto: UpdateMoneySettingsDto, actor = 'user'): Promise<MoneySettingsResponse> {
    await this.ledger.ensureSetup(userId);
    const baseCurrencyId = dto.baseCurrency ? (await this.commodities.currency(dto.baseCurrency)).id : undefined;
    await this.prisma.$transaction(async (db) => {
      await db.moneySettings.update({
        where: { userId },
        data: { baseCurrencyId, defaultCostBasis: dto.defaultCostBasis, taxResidence: dto.taxResidence },
      });
      await this.audit.record(db, { userId, actor, action: 'settings.update', details: { ...dto } });
    });
    return this.get(userId);
  }
}
