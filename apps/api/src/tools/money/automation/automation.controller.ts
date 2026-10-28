import { BadRequestException, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiParam, ApiProperty, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '@platform/db/prisma.service';
import { ApiEndpoint } from '@platform/common/api-endpoint.decorator';
import { UserModel } from '@platform/common/models';
import { JobsService } from '@platform/jobs/jobs.service';
import { JobResponse, toJobResponse } from '@platform/jobs/job.models';
import { MONEY_TASKS, quarterLabel, TASK_START_MINUTES, type MoneyTask } from '../core/automation';
import { formatDate, todayIn } from '../core/dates';
import { PriceFeedService } from '../feeds/price-feed.service';
import { moneyJobType } from './money-jobs';
import { MoneyScheduler } from './money-scheduler';

export class AutomationTask {
  @ApiProperty({ enum: MONEY_TASKS }) task!: string;
  @ApiProperty({ example: '17:15', description: 'local time it runs each day' }) startsAt!: string;
  @ApiProperty({ type: JobResponse, nullable: true, description: 'the latest run' }) lastJob!: JobResponse | null;
}

export class AutomationStatus {
  @ApiProperty({ example: 'Europe/Warsaw' }) timeZone!: string;
  @ApiProperty({ description: 'the daily schedule runs on this server' }) scheduler!: boolean;
  @ApiProperty({ type: [AutomationTask] }) tasks!: AutomationTask[];
  @ApiProperty({ description: 'first and latest stored day per rate source' }) rates!: { source: string; first: string | null; latest: string | null; count: number }[];
  @ApiProperty() priceFeeds!: { assetId: string; code: string; symbol: string; latest: { date: string; price: string; currency: string } | null }[];
  @ApiProperty() recurring!: { active: number; nextRunAt: string | null };
}

const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

@ApiTags('money')
@Controller('money/automation')
export class AutomationController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    private readonly scheduler: MoneyScheduler,
    private readonly priceFeed: PriceFeedService,
  ) {}

  @Get()
  @ApiEndpoint({ summary: 'What runs on its own: the daily jobs, rates and prices stored, recurring movements', response: AutomationStatus })
  async status(@Req() req: UserModel): Promise<AutomationStatus> {
    const userId = req.user.userId;
    const tasks: AutomationTask[] = [];
    for (const task of MONEY_TASKS) {
      const [job] = await this.jobs.list(userId, { type: moneyJobType(task), limit: 1 });
      tasks.push({ task, startsAt: hhmm(TASK_START_MINUTES[task]), lastJob: job ? toJobResponse(job) : null });
    }
    const grouped = await this.prisma.moneyExchangeRate.groupBy({ by: ['source'], _min: { date: true }, _max: { date: true }, _count: true });
    const rates = (['ecb', 'nbp', 'manual'] as const).map((source) => {
      const r = grouped.find((g) => g.source === source);
      return { source, first: r?._min.date ? formatDate(r._min.date) : null, latest: r?._max.date ? formatDate(r._max.date) : null, count: r?._count ?? 0 };
    });
    const priceFeeds: AutomationStatus['priceFeeds'] = [];
    for (const { asset, symbol } of await this.priceFeed.feedAssets(userId)) {
      const latest = await this.prisma.moneyPrice.findFirst({ where: { assetId: asset.commodityId, source: 'feed' }, orderBy: { date: 'desc' } });
      priceFeeds.push({
        assetId: asset.commodityId,
        code: asset.commodity.code,
        symbol,
        latest: latest ? { date: formatDate(latest.date), price: latest.price.toFixed(), currency: latest.quoteCurrencyId } : null,
      });
    }
    const active = await this.prisma.moneyRecurringRule.findMany({ where: { userId, pausedAt: null }, orderBy: { nextRunAt: 'asc' } });
    const running = active.filter((r) => !r.endDate || r.nextRunAt <= r.endDate);
    return {
      timeZone: this.scheduler.zone,
      scheduler: this.scheduler.enabled,
      tasks,
      rates,
      priceFeeds,
      recurring: { active: running.length, nextRunAt: running[0] ? formatDate(running[0].nextRunAt) : null },
    };
  }

  @Post(':task')
  @ApiParam({ name: 'task', enum: MONEY_TASKS })
  @ApiEndpoint({ summary: 'Run a daily job now', response: JobResponse })
  async run(@Req() req: UserModel, @Param('task') task: string): Promise<JobResponse> {
    if (!(MONEY_TASKS as readonly string[]).includes(task)) throw new BadRequestException(`task: one of ${MONEY_TASKS.join(', ')}`);
    const today = formatDate(todayIn(this.scheduler.zone));
    const payload: Record<string, string> =
      task === 'snapshot' ? { date: today, label: quarterLabel(today) } : task === 'prices' ? {} : { date: today };
    const job = await this.jobs.enqueue({ type: moneyJobType(task as MoneyTask), toolId: 'money', userId: req.user.userId, payload });
    return toJobResponse(job);
  }
}
