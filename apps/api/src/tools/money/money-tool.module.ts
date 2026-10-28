import { Module } from '@nestjs/common';
import { MoneyAutomationModule } from './automation/money-automation.module';
import { MoneyModule } from './money.module';

/** The money tool as the app mounts it: the ledger and what runs on its own. */
@Module({ imports: [MoneyModule, MoneyAutomationModule] })
export class MoneyToolModule {}
