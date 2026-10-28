import { Injectable, OnModuleInit } from '@nestjs/common';
import { NodeJobRunner } from '@platform/jobs/node-job-runner';
import { toDate } from '../common/parse';
import { PriceFeedService } from '../feeds/price-feed.service';
import { RateFeedService } from '../feeds/rate-feed.service';
import { RecurringService } from '../recurring/recurring.service';
import { SnapshotsService } from '../views/snapshots.service';
import type { MoneyTask } from '../core/automation';

export const moneyJobType = (task: MoneyTask) => `money.${task}`;

/**
 * The money tool's background jobs, run by the platform's Node job runner:
 * money.rates, money.prices, money.recurring and money.snapshot. Each is safe
 * to run again (rates and prices are stored once; a recurring occurrence moves
 * its rule on in the same database transaction; a snapshot replaces the day's).
 */
@Injectable()
export class MoneyJobs implements OnModuleInit {
  constructor(
    private readonly runner: NodeJobRunner,
    private readonly rateFeed: RateFeedService,
    private readonly priceFeed: PriceFeedService,
    private readonly recurring: RecurringService,
    private readonly snapshots: SnapshotsService,
  ) {}

  onModuleInit(): void {
    this.runner.registerHandler(moneyJobType('rates'), async (ctx) => this.rates(ctx.envelope.userId, ctx.payload));
    this.runner.registerHandler(moneyJobType('prices'), async (ctx) => this.prices(ctx.envelope.userId));
    this.runner.registerHandler(moneyJobType('recurring'), async (ctx) => this.runRecurring(ctx.envelope.userId, ctx.payload));
    this.runner.registerHandler(moneyJobType('snapshot'), async (ctx) => this.snapshot(ctx.envelope.userId, ctx.payload));
  }

  /** Rates from the user's first movement up to the day it was scheduled; fails (and is retried) when a source did not answer. */
  async rates(userId: string, payload: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const since = await this.rateFeed.firstDay(userId);
    const today = typeof payload.date === 'string' ? toDate(payload.date) : undefined;
    const result = await this.rateFeed.sync({ since: since ?? undefined, today });
    const errors = [result.ecb.error && `ECB: ${result.ecb.error}`, result.nbp.error && `NBP: ${result.nbp.error}`].filter(Boolean);
    if (errors.length > 0) throw new Error(`${errors.join('; ')} (stored ECB ${result.ecb.stored}, NBP ${result.nbp.stored})`);
    return { ...result };
  }

  async prices(userId: string): Promise<Record<string, unknown>> {
    const assets = await this.priceFeed.sync(userId);
    if (assets.length > 0 && assets.every((a) => a.error)) throw new Error(assets.map((a) => `${a.code}: ${a.error}`).join('; '));
    return { assets };
  }

  async runRecurring(userId: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const today = typeof payload.date === 'string' ? toDate(payload.date) : undefined;
    return { ...(await this.recurring.runDue(userId, today)) };
  }

  async snapshot(userId: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const date = typeof payload.date === 'string' ? toDate(payload.date) : undefined;
    const label = typeof payload.label === 'string' ? payload.label : undefined;
    const snap = await this.snapshots.take(userId, { date, label, actor: 'scheduler' });
    return { date: snap.date, label: snap.label, netWorth: snap.netWorth };
  }
}
