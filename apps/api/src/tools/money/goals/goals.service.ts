import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { MoneyGoal } from '@prisma/client';
import { PrismaService } from '@platform/db/prisma.service';
import { amountJson } from '../common/amounts';
import { parseMinor } from '../core/money';
import { AuditService } from '../ledger/audit.service';
import { CommoditiesService } from '../reference/commodities.service';
import { CreateGoalDto, GoalResponse } from './goals.models';

/** Enough finish lines to aim at; more would only crowd the way ahead. */
const MAX_GOALS = 12;

/**
 * Finish lines: a net worth the person wants to reach, kept in its own currency. Insights draws them
 * across the way ahead; they change nothing in the books.
 */
@Injectable()
export class GoalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commodities: CommoditiesService,
    private readonly audit: AuditService,
  ) {}

  /** Smallest first: the order they are reached in. */
  async list(userId: string): Promise<GoalResponse[]> {
    const rows = await this.prisma.moneyGoal.findMany({ where: { userId } });
    const sorted = rows.sort((a, b) => (a.targetMinor < b.targetMinor ? -1 : a.targetMinor > b.targetMinor ? 1 : a.createdAt.getTime() - b.createdAt.getTime()));
    return Promise.all(sorted.map((row) => this.response(row)));
  }

  async create(userId: string, dto: CreateGoalDto, actor = 'user'): Promise<GoalResponse> {
    const currency = await this.commodities.currency(dto.currency);
    const target = parseMinor(dto.target, currency.decimals);
    if (target <= 0n) throw new BadRequestException('A finish line is above zero');
    if ((await this.prisma.moneyGoal.count({ where: { userId } })) >= MAX_GOALS) throw new BadRequestException(`At most ${MAX_GOALS} finish lines`);
    const row = await this.prisma.$transaction(async (db) => {
      const created = await db.moneyGoal.create({ data: { userId, name: dto.name?.trim() || null, currencyId: currency.id, targetMinor: target } });
      await this.audit.record(db, { userId, actor, action: 'goal.create', subjectId: created.id, details: { target: dto.target, currency: currency.id } });
      return created;
    });
    return this.response(row);
  }

  async remove(userId: string, id: string, actor = 'user'): Promise<void> {
    const row = await this.prisma.moneyGoal.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException('Finish line not found');
    await this.prisma.$transaction(async (db) => {
      await db.moneyGoal.delete({ where: { id: row.id } });
      await this.audit.record(db, { userId, actor, action: 'goal.remove', subjectId: row.id, details: { target: row.targetMinor.toString(), currency: row.currencyId } });
    });
  }

  private async response(row: MoneyGoal): Promise<GoalResponse> {
    return {
      id: row.id,
      name: row.name,
      target: amountJson(row.targetMinor, row.currencyId, await this.commodities.decimalsOf(row.currencyId)),
      createdAt: row.createdAt.toISOString(),
    };
  }
}
