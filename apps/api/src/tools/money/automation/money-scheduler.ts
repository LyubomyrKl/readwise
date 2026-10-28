import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@platform/db/prisma.service';
import { EnvironmentVariables } from '@platform/config/env.validation';
import { JobsService } from '@platform/jobs/jobs.service';
import { dueTasks, MONEY_TASKS, type MoneyTask } from '../core/automation';
import { addDays, formatDate, minutesIntoDay, todayIn } from '../core/dates';
import { PriceFeedService } from '../feeds/price-feed.service';
import { moneyJobType } from './money-jobs';

const TICK_MS = 10 * 60_000;

/**
 * Wakes every ten minutes and enqueues the money jobs that are due for each
 * user of the tool (core/automation.ts says which and when). Runs where the
 * background work runs (APP_MODE all or worker), unless MONEY_SCHEDULER=off.
 */
@Injectable()
export class MoneyScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(MoneyScheduler.name);
  private readonly timeZone: string;
  readonly enabled: boolean;
  private timer?: NodeJS.Timeout;
  private first?: NodeJS.Timeout;
  private ticking = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    private readonly priceFeed: PriceFeedService,
    config: ConfigService<EnvironmentVariables>,
  ) {
    this.timeZone = config.get('MONEY_TIMEZONE', { infer: true }) ?? 'Europe/Warsaw';
    this.enabled = (config.get('APP_MODE', { infer: true }) ?? 'all') !== 'api' && config.get('MONEY_SCHEDULER', { infer: true }) !== 'off';
  }

  get zone(): string {
    return this.timeZone;
  }

  onApplicationBootstrap(): void {
    if (!this.enabled) return;
    const run = () => void this.tick().catch((error: unknown) => this.logger.error(`money scheduler: ${error instanceof Error ? error.message : String(error)}`));
    this.first = setTimeout(run, 30_000);
    this.first.unref();
    this.timer = setInterval(run, TICK_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.first) clearTimeout(this.first);
    if (this.timer) clearInterval(this.timer);
  }

  /** The local day each task last started for a user. */
  async lastRuns(userId: string): Promise<Partial<Record<MoneyTask, string>>> {
    const jobs = await this.prisma.job.findMany({
      where: { userId, type: { in: MONEY_TASKS.map(moneyJobType) } },
      orderBy: { createdAt: 'desc' },
      distinct: ['type'],
      select: { type: true, createdAt: true },
    });
    const out: Partial<Record<MoneyTask, string>> = {};
    for (const j of jobs) out[j.type.slice('money.'.length) as MoneyTask] = formatDate(todayIn(this.timeZone, j.createdAt));
    return out;
  }

  /** Enqueues what is due now; returns what it enqueued. */
  async tick(now: Date = new Date()): Promise<{ userId: string; task: MoneyTask }[]> {
    if (this.ticking) return [];
    this.ticking = true;
    try {
      const today = todayIn(this.timeZone, now);
      const minutes = minutesIntoDay(this.timeZone, now);
      const users = await this.prisma.moneySettings.findMany({ select: { userId: true } });
      const enqueued: { userId: string; task: MoneyTask }[] = [];
      for (const { userId } of users) {
        const snapshots = await this.prisma.moneySnapshot.findMany({ where: { userId, date: { gte: addDays(today, -40) } }, select: { date: true } });
        const due = dueTasks({
          today: formatDate(today),
          minutes,
          lastRun: await this.lastRuns(userId),
          snapshots: snapshots.map((s) => formatDate(s.date)),
          hasPriceFeeds: (await this.priceFeed.feedAssets(userId)).length > 0,
        });
        for (const { task, payload } of due) {
          await this.jobs.enqueue({ type: moneyJobType(task), toolId: 'money', userId, payload });
          enqueued.push({ userId, task });
        }
      }
      if (enqueued.length > 0) this.logger.log(`enqueued ${enqueued.map((e) => e.task).join(', ')}`);
      return enqueued;
    } finally {
      this.ticking = false;
    }
  }
}
