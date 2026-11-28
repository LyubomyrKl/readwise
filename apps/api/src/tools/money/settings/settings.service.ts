import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@platform/db/prisma.service';
import { monthKey, parseDate } from '../core/dates';
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
    return {
      baseCurrency: s.baseCurrencyId,
      defaultCostBasis: s.defaultCostBasis,
      taxResidence: s.taxResidence,
      expectedReturn: s.expectedReturn.toFixed(),
      forecastRange: s.forecastRange,
      forecastSince: s.forecastSince ? monthKey(s.forecastSince) : null,
      forecastUntil: s.forecastUntil ? monthKey(s.forecastUntil) : null,
    };
  }

  /** Switching the base currency changes how totals are shown, never what is stored (rule 5). */
  async update(userId: string, dto: UpdateMoneySettingsDto, actor = 'user'): Promise<MoneySettingsResponse> {
    await this.ledger.ensureSetup(userId);
    const baseCurrencyId = dto.baseCurrency ? (await this.commodities.currency(dto.baseCurrency)).id : undefined;
    // a custom range needs its first month, and ends (if it ends) no earlier
    const now = await this.get(userId);
    const range = dto.forecastRange ?? now.forecastRange;
    const since = dto.forecastSince === undefined ? now.forecastSince : dto.forecastSince;
    const until = dto.forecastUntil === undefined ? now.forecastUntil : dto.forecastUntil;
    if (range === 'custom' && !since) throw new BadRequestException('A custom range needs its start month');
    if (since && until && until < since) throw new BadRequestException('A custom range cannot end before it starts');
    const month = (value: string | null | undefined) => (value === undefined ? undefined : value === null ? null : parseDate(`${value}-01`));
    await this.prisma.$transaction(async (db) => {
      await db.moneySettings.update({
        where: { userId },
        data: {
          baseCurrencyId,
          defaultCostBasis: dto.defaultCostBasis,
          taxResidence: dto.taxResidence,
          expectedReturn: dto.expectedReturn,
          forecastRange: dto.forecastRange,
          forecastSince: month(dto.forecastSince),
          forecastUntil: month(dto.forecastUntil),
        },
      });
      await this.audit.record(db, { userId, actor, action: 'settings.update', details: { ...dto } });
    });
    return this.get(userId);
  }
}
