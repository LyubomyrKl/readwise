import { Module } from '@nestjs/common';
import { JobsModule } from '@platform/jobs/jobs.module';
import { MoneyModule } from '../money.module';
import { AutomationController } from './automation.controller';
import { MoneyJobs } from './money-jobs';
import { MoneyScheduler } from './money-scheduler';

/**
 * What runs on its own: the daily jobs on the platform job system. Kept apart
 * from MoneyModule so the ledger works (and is tested) without a queue.
 */
@Module({
  imports: [JobsModule, MoneyModule],
  controllers: [AutomationController],
  providers: [MoneyJobs, MoneyScheduler],
})
export class MoneyAutomationModule {}
