import { Module } from '@nestjs/common';
import { AccountsController } from './accounts/accounts.controller';
import { AccountsService } from './accounts/accounts.service';
import { BalancesService } from './accounts/balances.service';
import { CategoriesController } from './categories/categories.controller';
import { CategoriesService } from './categories/categories.service';
import { DraftsController } from './drafts/drafts.controller';
import { DraftsService } from './drafts/drafts.service';
import { ImportsController } from './imports/imports.controller';
import { AssetsService } from './investments/assets.service';
import { InvestmentsController } from './investments/investments.controller';
import { LotsService } from './investments/lots.service';
import { PositionsService } from './investments/positions.service';
import { PricesService } from './investments/prices.service';
import { TradesService } from './investments/trades.service';
import { ValuationService } from './investments/valuation.service';
import { ImportsService } from './imports/imports.service';
import { AuditService } from './ledger/audit.service';
import { LedgerService } from './ledger/ledger.service';
import { MovementsController } from './movements/movements.controller';
import { MovementsService } from './movements/movements.service';
import { CommoditiesService } from './reference/commodities.service';
import { CurrenciesController } from './reference/currencies.controller';
import { ClaudeController } from './claude/claude.controller';
import { ClaudeService } from './claude/claude.service';
import { McpController } from './claude/mcp.controller';
import { MoneyTokenGuard } from './claude/token.guard';
import { TokensController } from './claude/tokens.controller';
import { TokensService } from './claude/tokens.service';
import { OAuthController } from './claude/oauth.controller';
import { OAuthService } from './claude/oauth.service';
import { RatesController } from './rates/rates.controller';
import { RatesService } from './rates/rates.service';
import { MoneyHttp } from './feeds/http.service';
import { PriceFeedService } from './feeds/price-feed.service';
import { RateFeedService } from './feeds/rate-feed.service';
import { RecurringController } from './recurring/recurring.controller';
import { RecurringService } from './recurring/recurring.service';
import { TaxController } from './tax/tax.controller';
import { TaxService } from './tax/tax.service';
import { MoneySettingsController } from './settings/settings.controller';
import { MoneySettingsService } from './settings/settings.service';
import { TransactionsController } from './transactions/transactions.controller';
import { SnapshotsService } from './views/snapshots.service';
import { ViewsController } from './views/views.controller';
import { ViewsService } from './views/views.service';
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
    ImportsController,
    InvestmentsController,
    ViewsController,
    RatesController,
    RecurringController,
    TaxController,
    TokensController,
    ClaudeController,
    McpController,
    OAuthController,
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
    ImportsService,
    RatesService,
    LotsService,
    ValuationService,
    AssetsService,
    PricesService,
    PositionsService,
    TradesService,
    ViewsService,
    SnapshotsService,
    MoneyHttp,
    RateFeedService,
    PriceFeedService,
    RecurringService,
    TaxService,
    TokensService,
    OAuthService,
    ClaudeService,
    MoneyTokenGuard,
  ],
  exports: [LedgerService, MovementsService, TransactionsService, RateFeedService, PriceFeedService, RecurringService, SnapshotsService],
})
export class MoneyModule {}
