import { Module } from '@nestjs/common';
import { CurrenciesController } from './reference/currencies.controller';
import { CurrenciesService } from './reference/currencies.service';

/**
 * The money tool: accounts, a double-entry ledger and investments
 * (docs/money/plan.md). `core/` is pure money arithmetic with no Nest or Prisma
 * imports; feature directories build on it milestone by milestone.
 */
@Module({
  controllers: [CurrenciesController],
  providers: [CurrenciesService],
})
export class MoneyModule {}
