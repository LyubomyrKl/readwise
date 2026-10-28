import { Module } from '@nestjs/common';
import { AccountsController } from './accounts/accounts.controller';
import { AccountsService } from './accounts/accounts.service';
import { BalancesService } from './accounts/balances.service';
import { CategoriesController } from './categories/categories.controller';
import { CategoriesService } from './categories/categories.service';
import { DraftsController } from './drafts/drafts.controller';
import { DraftsService } from './drafts/drafts.service';
import { AuditService } from './ledger/audit.service';
import { LedgerService } from './ledger/ledger.service';
import { MovementsController } from './movements/movements.controller';
import { MovementsService } from './movements/movements.service';
import { CommoditiesService } from './reference/commodities.service';
import { CurrenciesController } from './reference/currencies.controller';
import { MoneySettingsController } from './settings/settings.controller';
import { MoneySettingsService } from './settings/settings.service';
import { TransactionsController } from './transactions/transactions.controller';
import { TransactionsService } from './transactions/transactions.service';

/**
 * The money tool: accounts, a double-entry ledger and investments
 * (docs/money/plan.md). `core/` is pure money arithmetic with no Nest or Prisma
 * imports; `ledger/` is the single write path; feature directories build on it.
 */
@Module({
  controllers: [
    CurrenciesController,
    MoneySettingsController,
    AccountsController,
    CategoriesController,
    MovementsController,
    TransactionsController,
    DraftsController,
  ],
  providers: [
    CommoditiesService,
    AuditService,
    LedgerService,
    BalancesService,
    MoneySettingsService,
    AccountsService,
    CategoriesService,
    TransactionsService,
    MovementsService,
    DraftsService,
  ],
  exports: [LedgerService, MovementsService, TransactionsService],
})
export class MoneyModule {}
