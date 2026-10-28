import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@platform/db/prisma.service';
import { amountJson } from '../common/amounts';
import { formatDate } from '../core/dates';
import { PositionsService } from '../investments/positions.service';
import { AuditService } from '../ledger/audit.service';
import { jsonInput } from '../ledger/ledger.service';
import { CommoditiesService } from '../reference/commodities.service';
import { SnapshotResponse } from './view.models';
import { ViewsService } from './views.service';

/** The quarterly checkpoint: net worth, positions and allocation frozen at a day. */
@Injectable()
export class SnapshotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly views: ViewsService,
    private readonly positions: PositionsService,
    private readonly commodities: CommoditiesService,
    private readonly audit: AuditService,
  ) {}

  async take(userId: string, opts: { date?: Date; label?: string; actor?: string } = {}): Promise<SnapshotResponse> {
    const date = opts.date ?? this.views.today();
    const base = await this.views.baseOf(userId);
    const [netWorth, allocation, positions] = await Promise.all([
      this.views.netWorth(userId, { base, asOf: date }),
      this.views.allocation(userId, { base, asOf: date }),
      this.positions.positions(userId, { asOf: date }),
    ]);
    const data = { netWorth, allocation, positions };
    const row = await this.prisma.$transaction(async (db) => {
      const saved = await db.moneySnapshot.upsert({
        where: { userId_date: { userId, date } },
        create: { userId, date, label: opts.label ?? null, baseCurrencyId: base, netWorthMinor: BigInt(netWorth.total.minor), data: jsonInput(data) },
        update: { label: opts.label ?? undefined, baseCurrencyId: base, netWorthMinor: BigInt(netWorth.total.minor), data: jsonInput(data) },
      });
      await this.audit.record(db, { userId, actor: opts.actor ?? 'user', action: 'snapshot.take', subjectId: saved.id, details: { date: formatDate(date) } });
      return saved;
    });
    return this.present(row);
  }

  async list(userId: string): Promise<SnapshotResponse[]> {
    const rows = await this.prisma.moneySnapshot.findMany({ where: { userId }, orderBy: { date: 'desc' }, take: 200 });
    return Promise.all(rows.map((r) => this.present(r, false)));
  }

  async get(userId: string, id: string): Promise<SnapshotResponse> {
    const row = await this.prisma.moneySnapshot.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException('snapshot not found');
    return this.present(row);
  }

  private async present(
    row: { id: string; date: Date; label: string | null; baseCurrencyId: string; netWorthMinor: bigint; data: unknown; createdAt: Date },
    withData = true,
  ): Promise<SnapshotResponse> {
    return {
      id: row.id,
      date: formatDate(row.date),
      label: row.label,
      netWorth: amountJson(row.netWorthMinor, row.baseCurrencyId, await this.commodities.decimalsOf(row.baseCurrencyId)),
      data: withData ? row.data : null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
