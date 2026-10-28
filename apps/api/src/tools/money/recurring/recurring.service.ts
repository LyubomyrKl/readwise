import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MoneyRecurringRule } from '@prisma/client';
import { PrismaService } from '@platform/db/prisma.service';
import { EnvironmentVariables } from '@platform/config/env.validation';
import { WRITE_TX, type Db } from '../common/db';
import { toDate } from '../common/parse';
import { validateInput } from '../common/validation';
import { addDays, formatDate, todayIn } from '../core/dates';
import { formatSchedule, nextOccurrence, occurrences, parseSchedule, ScheduleError, type Schedule } from '../core/schedule';
import { DraftsService } from '../drafts/drafts.service';
import { AuditService } from '../ledger/audit.service';
import { jsonInput, LedgerService } from '../ledger/ledger.service';
import { MovementsService } from '../movements/movements.service';
import { CreateRecurringDto, RecurringResponse, RecurringRunResult, UpdateRecurringDto, type RecurringKind } from './recurring.models';

/** Occurrences one run posts at most per rule (a server off for two months still catches up). */
const CATCH_UP_LIMIT = 62;

class AlreadyRun extends Error {}

/**
 * Recurring movements: a template (the movement without its date) and a
 * schedule. Each day the recurring job turns every occurrence due into a
 * draft, or posts it when the rule says so; the rule moves on to its next date
 * in the same database transaction, so an occurrence never runs twice.
 */
@Injectable()
export class RecurringService {
  private readonly timeZone: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly movements: MovementsService,
    private readonly drafts: DraftsService,
    private readonly audit: AuditService,
    config: ConfigService<EnvironmentVariables>,
  ) {
    this.timeZone = config.get('MONEY_TIMEZONE', { infer: true }) ?? 'Europe/Warsaw';
  }

  today(): Date {
    return todayIn(this.timeZone);
  }

  async list(userId: string): Promise<RecurringResponse[]> {
    const rules = await this.prisma.moneyRecurringRule.findMany({
      where: { userId },
      orderBy: [{ nextRunAt: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { runs: true } } },
    });
    return rules.map((r) => this.present(r, r._count.runs));
  }

  async get(userId: string, id: string): Promise<RecurringResponse> {
    const rule = await this.prisma.moneyRecurringRule.findFirst({ where: { id, userId }, include: { _count: { select: { runs: true } } } });
    if (!rule) throw new NotFoundException('recurring movement not found');
    return this.present(rule, rule._count.runs);
  }

  async create(userId: string, dto: CreateRecurringDto): Promise<RecurringResponse> {
    const schedule = this.schedule(dto.schedule);
    const start = toDate(dto.startDate, 'startDate');
    const end = dto.endDate ? toDate(dto.endDate, 'endDate') : null;
    if (end && end < start) throw new BadRequestException('the end date is before the start');
    const template = await this.template(dto.kind, dto.template, start, dto.autoPost ?? false);
    const next = nextOccurrence(schedule, start, start, end);
    if (!next) throw new BadRequestException('this schedule never runs between the start and the end');
    await this.ledger.ensureSetup(userId);
    const rule = await this.prisma.$transaction(async (db) => {
      const created = await db.moneyRecurringRule.create({
        data: {
          userId,
          name: dto.name.trim(),
          kind: dto.kind,
          template: jsonInput(template),
          schedule: formatSchedule(schedule),
          startDate: start,
          endDate: end,
          nextRunAt: next,
          autoPost: dto.autoPost ?? false,
        },
      });
      await this.audit.record(db, { userId, actor: 'user', action: 'recurring.create', subjectId: created.id, details: { name: created.name, schedule: created.schedule } });
      return created;
    });
    return this.present(rule, 0);
  }

  async update(userId: string, id: string, dto: UpdateRecurringDto): Promise<RecurringResponse> {
    const rule = await this.ruleOf(userId, id);
    const schedule = dto.schedule !== undefined ? this.schedule(dto.schedule) : this.schedule(rule.schedule);
    const end = dto.endDate === undefined ? rule.endDate : dto.endDate === null ? null : toDate(dto.endDate, 'endDate');
    if (end && end < rule.startDate) throw new BadRequestException('the end date is before the start');
    const autoPost = dto.autoPost ?? rule.autoPost;
    const template =
      dto.template !== undefined || dto.autoPost !== undefined
        ? await this.template(rule.kind as RecurringKind, dto.template ?? (rule.template as Record<string, unknown>), rule.nextRunAt, autoPost)
        : (rule.template as Record<string, unknown>);

    let pausedAt = rule.pausedAt;
    let nextRunAt = rule.nextRunAt;
    if (dto.paused === true && !pausedAt) pausedAt = new Date();
    const resuming = dto.paused === false && pausedAt !== null;
    if (resuming) pausedAt = null;
    if (dto.schedule !== undefined || dto.endDate !== undefined || resuming) {
      // never back over days already run; a resumed rule skips the paused days
      const today = this.today();
      const from = resuming && today > rule.nextRunAt ? today : rule.nextRunAt;
      nextRunAt = nextOccurrence(schedule, rule.startDate, from, end) ?? addDays(end ?? from, 1);
    }

    const saved = await this.prisma.$transaction(async (db) => {
      const updated = await db.moneyRecurringRule.update({
        where: { id },
        data: {
          name: dto.name?.trim() ?? rule.name,
          template: jsonInput(template),
          schedule: formatSchedule(schedule),
          endDate: end,
          autoPost,
          pausedAt,
          nextRunAt,
        },
        include: { _count: { select: { runs: true } } },
      });
      await this.audit.record(db, { userId, actor: 'user', action: 'recurring.update', subjectId: id, details: { ...dto } });
      return updated;
    });
    return this.present(saved, saved._count.runs);
  }

  /** The movements it made stay; they only lose the link. */
  async remove(userId: string, id: string): Promise<{ removed: true }> {
    const rule = await this.ruleOf(userId, id);
    await this.prisma.$transaction(async (db) => {
      await db.moneyRecurringRule.delete({ where: { id } });
      await this.audit.record(db, { userId, actor: 'user', action: 'recurring.remove', subjectId: id, details: { name: rule.name } });
    });
    return { removed: true };
  }

  /** Every occurrence due on or before `today`, oldest first: drafts, or posted movements. */
  async runDue(userId: string, today: Date = this.today()): Promise<RecurringRunResult> {
    const rules = await this.prisma.moneyRecurringRule.findMany({ where: { userId, pausedAt: null, nextRunAt: { lte: today } }, orderBy: { nextRunAt: 'asc' } });
    const result: RecurringRunResult = { posted: 0, drafted: 0, errors: [] };
    if (rules.length > 0) await this.ledger.ensureSetup(userId);
    for (const rule of rules) {
      let schedule: Schedule;
      try {
        schedule = parseSchedule(rule.schedule);
      } catch (error) {
        result.errors.push({ ruleId: rule.id, name: rule.name, date: formatDate(rule.nextRunAt), error: String(error) });
        continue;
      }
      let current = rule.nextRunAt;
      for (const date of occurrences(schedule, rule.startDate, rule.nextRunAt, today, { end: rule.endDate, limit: CATCH_UP_LIMIT })) {
        const next = nextOccurrence(schedule, rule.startDate, addDays(date, 1), rule.endDate) ?? addDays(rule.endDate ?? date, 1);
        const template = rule.template as Record<string, unknown>;
        const movement = {
          kind: rule.kind as RecurringKind,
          input: { ...template, date: formatDate(date), note: typeof template.note === 'string' && template.note ? template.note : rule.name },
        };
        const claim = async (db: Db) => {
          const claimed = await db.moneyRecurringRule.updateMany({ where: { id: rule.id, nextRunAt: current }, data: { nextRunAt: next, lastRunAt: new Date() } });
          if (claimed.count === 0) throw new AlreadyRun();
        };
        const draft = (note?: string) =>
          this.prisma.$transaction(async (db) => {
            await claim(db);
            await this.drafts.createIn(db, userId, movement, { actor: `recurring:${rule.id}`, recurringRuleId: rule.id, date, note });
          }, WRITE_TX);
        try {
          if (rule.autoPost) {
            try {
              await this.prisma.$transaction(async (db) => {
                await claim(db);
                await this.movements.post(userId, movement, { actor: `recurring:${rule.id}`, db, recurringRuleId: rule.id });
              }, WRITE_TX);
              result.posted++;
            } catch (error) {
              if (error instanceof AlreadyRun) throw error;
              // could not post (an archived account, a missing price…): propose it instead
              await draft(`${rule.name}: not posted, ${errorText(error)}`);
              result.drafted++;
              result.errors.push({ ruleId: rule.id, name: rule.name, date: formatDate(date), error: errorText(error) });
            }
          } else {
            await draft();
            result.drafted++;
          }
          current = next;
        } catch (error) {
          if (error instanceof AlreadyRun) break; // another run got there first
          result.errors.push({ ruleId: rule.id, name: rule.name, date: formatDate(date), error: errorText(error) });
          break;
        }
      }
    }
    return result;
  }

  // ---- internals ------------------------------------------------------------------------

  private schedule(rule: string): Schedule {
    try {
      return parseSchedule(rule);
    } catch (error) {
      if (error instanceof ScheduleError) throw new BadRequestException(`schedule: ${error.message}`);
      throw error;
    }
  }

  /** A rule that posts on its own needs a complete movement; a draft may leave fields for the approval. */
  private async template(kind: RecurringKind, raw: Record<string, unknown>, sampleDate: Date, autoPost: boolean): Promise<Record<string, unknown>> {
    const { date: _date, ...template } = raw;
    const movement = { kind, input: { ...template, date: formatDate(sampleDate) } };
    if (autoPost) await validateInput(this.movements.handler(kind).dto, movement.input);
    else await this.drafts.check(movement);
    return template;
  }

  private async ruleOf(userId: string, id: string): Promise<MoneyRecurringRule> {
    const rule = await this.prisma.moneyRecurringRule.findFirst({ where: { id, userId } });
    if (!rule) throw new NotFoundException('recurring movement not found');
    return rule;
  }

  private present(rule: MoneyRecurringRule, runs: number): RecurringResponse {
    const schedule = parseSchedule(rule.schedule);
    const finished = rule.endDate !== null && rule.nextRunAt > rule.endDate;
    const upcoming = finished || rule.pausedAt ? [] : occurrences(schedule, rule.startDate, rule.nextRunAt, addDays(rule.nextRunAt, 400), { end: rule.endDate, limit: 3 });
    return {
      id: rule.id,
      name: rule.name,
      kind: rule.kind,
      template: rule.template as Record<string, unknown>,
      schedule: rule.schedule,
      startDate: formatDate(rule.startDate),
      endDate: rule.endDate ? formatDate(rule.endDate) : null,
      nextRunAt: formatDate(rule.nextRunAt),
      upcoming: upcoming.map(formatDate),
      autoPost: rule.autoPost,
      paused: rule.pausedAt !== null,
      finished,
      lastRunAt: rule.lastRunAt?.toISOString() ?? null,
      runs,
      createdAt: rule.createdAt.toISOString(),
    };
  }
}

function errorText(error: unknown): string {
  if (error instanceof BadRequestException) {
    const body = error.getResponse() as { message?: string | string[] };
    return Array.isArray(body.message) ? body.message.join('; ') : (body.message ?? error.message);
  }
  return error instanceof Error ? error.message : String(error);
}
