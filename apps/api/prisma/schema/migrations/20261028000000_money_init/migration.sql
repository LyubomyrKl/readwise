-- CreateEnum
CREATE TYPE "money_commodity_kind" AS ENUM ('currency', 'asset');

-- CreateEnum
CREATE TYPE "money_cost_basis_method" AS ENUM ('fifo', 'average');

-- CreateEnum
CREATE TYPE "money_institution_kind" AS ENUM ('bank', 'broker', 'bond_registry', 'lender', 'cash');

-- CreateEnum
CREATE TYPE "money_account_type" AS ENUM ('bank', 'investment', 'bonds', 'debt', 'system');

-- CreateEnum
CREATE TYPE "money_system_role" AS ENUM ('income', 'expense', 'opening_balance', 'conversion');

-- CreateEnum
CREATE TYPE "money_tax_wrapper" AS ENUM ('taxable', 'tax_advantaged');

-- CreateEnum
CREATE TYPE "money_valuation" AS ENUM ('manual', 'price_feed', 'bond_formula');

-- CreateEnum
CREATE TYPE "money_category_kind" AS ENUM ('income', 'expense');

-- CreateEnum
CREATE TYPE "money_transaction_kind" AS ENUM ('opening_balance', 'income', 'expense', 'transfer', 'buy', 'sell', 'investment_income', 'fee', 'unit_move', 'split', 'correction');

-- CreateEnum
CREATE TYPE "money_transaction_status" AS ENUM ('posted', 'draft');

-- CreateEnum
CREATE TYPE "money_rate_source" AS ENUM ('ecb', 'nbp', 'manual');

-- CreateEnum
CREATE TYPE "money_price_source" AS ENUM ('manual', 'import', 'feed');

-- CreateEnum
CREATE TYPE "money_import_batch_status" AS ENUM ('preview', 'committed');

-- CreateEnum
CREATE TYPE "money_import_row_status" AS ENUM ('pending', 'ready', 'duplicate', 'matched', 'imported', 'skipped', 'error');

-- CreateEnum
CREATE TYPE "money_token_scope" AS ENUM ('read', 'draft');

-- CreateEnum
CREATE TYPE "money_lot_consumption_kind" AS ENUM ('sale', 'move');

-- CreateTable
CREATE TABLE "money_settings" (
    "userId" TEXT NOT NULL,
    "baseCurrencyId" TEXT NOT NULL DEFAULT 'PLN',
    "defaultCostBasis" "money_cost_basis_method" NOT NULL DEFAULT 'fifo',
    "taxResidence" TEXT NOT NULL DEFAULT 'PL',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "money_settings_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "money_commodity" (
    "id" TEXT NOT NULL,
    "kind" "money_commodity_kind" NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "decimals" INTEGER NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "money_commodity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "money_asset" (
    "commodityId" TEXT NOT NULL,
    "ticker" TEXT,
    "isin" TEXT,
    "unitName" TEXT NOT NULL DEFAULT 'units',
    "quoteCurrencyId" TEXT NOT NULL,
    "valuation" "money_valuation" NOT NULL DEFAULT 'manual',
    "valuationConfig" JSONB,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "money_asset_pkey" PRIMARY KEY ("commodityId")
);

-- CreateTable
CREATE TABLE "money_asset_class" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "money_asset_class_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "money_asset_class_split" (
    "assetId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "percent" DECIMAL(7,4) NOT NULL,

    CONSTRAINT "money_asset_class_split_pkey" PRIMARY KEY ("assetId","classId")
);

-- CreateTable
CREATE TABLE "money_allocation_target" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "percent" DECIMAL(7,4) NOT NULL,
    "validFrom" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "money_allocation_target_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "money_institution" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "money_institution_kind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "money_institution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "money_account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "institutionId" TEXT,
    "name" TEXT NOT NULL,
    "type" "money_account_type" NOT NULL,
    "systemRole" "money_system_role",
    "taxWrapper" "money_tax_wrapper" NOT NULL DEFAULT 'taxable',
    "costBasisMethod" "money_cost_basis_method",
    "cashClassId" TEXT,
    "number" TEXT,
    "importProfile" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "money_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "money_sub_account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "commodityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "money_sub_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "money_category" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "money_category_kind" NOT NULL,
    "parentId" TEXT,
    "key" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "money_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "money_transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "kind" "money_transaction_kind" NOT NULL,
    "status" "money_transaction_status" NOT NULL DEFAULT 'posted',
    "note" TEXT,
    "categoryId" TEXT,
    "assetId" TEXT,
    "correctsId" TEXT,
    "recurringRuleId" TEXT,
    "importRowId" TEXT,
    "draft" JSONB,
    "proposedBy" TEXT,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "money_transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "money_entry" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "subAccountId" TEXT NOT NULL,
    "amountMinor" BIGINT,
    "quantity" DECIMAL(28,10),
    "categoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "money_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "money_lot" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "openingEntryId" TEXT NOT NULL,
    "parentLotId" TEXT,
    "units" DECIMAL(28,10) NOT NULL,
    "remainingUnits" DECIMAL(28,10) NOT NULL,
    "costMinor" BIGINT NOT NULL,
    "remainingCostMinor" BIGINT NOT NULL,
    "costCurrencyId" TEXT NOT NULL,
    "tradeCostMinor" BIGINT,
    "tradeCurrencyId" TEXT,
    "costPlnMinor" BIGINT,
    "costPlnRate" DECIMAL(28,12),
    "costPlnRateDate" DATE,
    "acquiredAt" DATE NOT NULL,
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "money_lot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "money_lot_consumption" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "kind" "money_lot_consumption_kind" NOT NULL,
    "units" DECIMAL(28,10) NOT NULL,
    "costAllocatedMinor" BIGINT NOT NULL,
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "money_lot_consumption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "money_price" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "price" DECIMAL(28,10) NOT NULL,
    "quoteCurrencyId" TEXT NOT NULL,
    "source" "money_price_source" NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "money_price_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "money_exchange_rate" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "rate" DECIMAL(28,12) NOT NULL,
    "source" "money_rate_source" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "money_exchange_rate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "money_recurring_rule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "money_transaction_kind" NOT NULL,
    "template" JSONB NOT NULL,
    "schedule" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "nextRunAt" DATE NOT NULL,
    "autoPost" BOOLEAN NOT NULL DEFAULT false,
    "pausedAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "money_recurring_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "money_snapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "label" TEXT,
    "baseCurrencyId" TEXT NOT NULL,
    "netWorthMinor" BIGINT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "money_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "money_import_batch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceProfile" TEXT NOT NULL,
    "accountId" TEXT,
    "fileName" TEXT NOT NULL,
    "fileSha256" TEXT NOT NULL,
    "encoding" TEXT,
    "status" "money_import_batch_status" NOT NULL DEFAULT 'preview',
    "mapping" JSONB,
    "options" JSONB,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "committedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "money_import_batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "money_import_row" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "raw" JSONB NOT NULL,
    "proposal" JSONB,
    "dedupeHash" TEXT,
    "status" "money_import_row_status" NOT NULL DEFAULT 'pending',
    "message" TEXT,
    "matchTransactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "money_import_row_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "money_api_token" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" "money_token_scope" NOT NULL DEFAULT 'read',
    "tokenHash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "money_api_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "money_audit_log" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "subjectId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "money_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "money_commodity_kind_code_idx" ON "money_commodity"("kind", "code");

-- CreateIndex
CREATE INDEX "money_commodity_userId_idx" ON "money_commodity"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "money_asset_class_userId_name_key" ON "money_asset_class"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "money_allocation_target_classId_validFrom_key" ON "money_allocation_target"("classId", "validFrom");

-- CreateIndex
CREATE UNIQUE INDEX "money_institution_userId_name_key" ON "money_institution"("userId", "name");

-- CreateIndex
CREATE INDEX "money_account_userId_archivedAt_idx" ON "money_account"("userId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "money_account_userId_systemRole_key" ON "money_account"("userId", "systemRole");

-- CreateIndex
CREATE UNIQUE INDEX "money_sub_account_accountId_commodityId_key" ON "money_sub_account"("accountId", "commodityId");

-- CreateIndex
CREATE INDEX "money_category_userId_kind_idx" ON "money_category"("userId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "money_category_userId_key_key" ON "money_category"("userId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "money_transaction_importRowId_key" ON "money_transaction"("importRowId");

-- CreateIndex
CREATE INDEX "money_transaction_userId_status_date_idx" ON "money_transaction"("userId", "status", "date");

-- CreateIndex
CREATE INDEX "money_transaction_correctsId_idx" ON "money_transaction"("correctsId");

-- CreateIndex
CREATE INDEX "money_transaction_assetId_idx" ON "money_transaction"("assetId");

-- CreateIndex
CREATE INDEX "money_entry_transactionId_idx" ON "money_entry"("transactionId");

-- CreateIndex
CREATE INDEX "money_entry_subAccountId_idx" ON "money_entry"("subAccountId");

-- CreateIndex
CREATE INDEX "money_entry_categoryId_idx" ON "money_entry"("categoryId");

-- CreateIndex
CREATE INDEX "money_lot_accountId_assetId_acquiredAt_idx" ON "money_lot"("accountId", "assetId", "acquiredAt");

-- CreateIndex
CREATE INDEX "money_lot_transactionId_idx" ON "money_lot"("transactionId");

-- CreateIndex
CREATE INDEX "money_lot_consumption_lotId_idx" ON "money_lot_consumption"("lotId");

-- CreateIndex
CREATE INDEX "money_lot_consumption_transactionId_idx" ON "money_lot_consumption"("transactionId");

-- CreateIndex
CREATE INDEX "money_price_assetId_date_idx" ON "money_price"("assetId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "money_price_assetId_date_source_key" ON "money_price"("assetId", "date", "source");

-- CreateIndex
CREATE INDEX "money_exchange_rate_fromId_toId_date_idx" ON "money_exchange_rate"("fromId", "toId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "money_exchange_rate_source_date_fromId_toId_key" ON "money_exchange_rate"("source", "date", "fromId", "toId");

-- CreateIndex
CREATE INDEX "money_recurring_rule_nextRunAt_idx" ON "money_recurring_rule"("nextRunAt");

-- CreateIndex
CREATE UNIQUE INDEX "money_snapshot_userId_date_key" ON "money_snapshot"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "money_import_batch_userId_fileSha256_key" ON "money_import_batch"("userId", "fileSha256");

-- CreateIndex
CREATE INDEX "money_import_row_dedupeHash_idx" ON "money_import_row"("dedupeHash");

-- CreateIndex
CREATE UNIQUE INDEX "money_import_row_batchId_rowNumber_key" ON "money_import_row"("batchId", "rowNumber");

-- CreateIndex
CREATE UNIQUE INDEX "money_api_token_tokenHash_key" ON "money_api_token"("tokenHash");

-- CreateIndex
CREATE INDEX "money_api_token_userId_idx" ON "money_api_token"("userId");

-- CreateIndex
CREATE INDEX "money_audit_log_userId_createdAt_idx" ON "money_audit_log"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "money_settings" ADD CONSTRAINT "money_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_settings" ADD CONSTRAINT "money_settings_baseCurrencyId_fkey" FOREIGN KEY ("baseCurrencyId") REFERENCES "money_commodity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_commodity" ADD CONSTRAINT "money_commodity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_asset" ADD CONSTRAINT "money_asset_commodityId_fkey" FOREIGN KEY ("commodityId") REFERENCES "money_commodity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_asset" ADD CONSTRAINT "money_asset_quoteCurrencyId_fkey" FOREIGN KEY ("quoteCurrencyId") REFERENCES "money_commodity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_asset_class" ADD CONSTRAINT "money_asset_class_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_asset_class_split" ADD CONSTRAINT "money_asset_class_split_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "money_asset"("commodityId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_asset_class_split" ADD CONSTRAINT "money_asset_class_split_classId_fkey" FOREIGN KEY ("classId") REFERENCES "money_asset_class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_allocation_target" ADD CONSTRAINT "money_allocation_target_classId_fkey" FOREIGN KEY ("classId") REFERENCES "money_asset_class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_institution" ADD CONSTRAINT "money_institution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_account" ADD CONSTRAINT "money_account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_account" ADD CONSTRAINT "money_account_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "money_institution"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_account" ADD CONSTRAINT "money_account_cashClassId_fkey" FOREIGN KEY ("cashClassId") REFERENCES "money_asset_class"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_sub_account" ADD CONSTRAINT "money_sub_account_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "money_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_sub_account" ADD CONSTRAINT "money_sub_account_commodityId_fkey" FOREIGN KEY ("commodityId") REFERENCES "money_commodity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_category" ADD CONSTRAINT "money_category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_category" ADD CONSTRAINT "money_category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "money_category"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_transaction" ADD CONSTRAINT "money_transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_transaction" ADD CONSTRAINT "money_transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "money_category"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_transaction" ADD CONSTRAINT "money_transaction_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "money_asset"("commodityId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_transaction" ADD CONSTRAINT "money_transaction_correctsId_fkey" FOREIGN KEY ("correctsId") REFERENCES "money_transaction"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_transaction" ADD CONSTRAINT "money_transaction_recurringRuleId_fkey" FOREIGN KEY ("recurringRuleId") REFERENCES "money_recurring_rule"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_transaction" ADD CONSTRAINT "money_transaction_importRowId_fkey" FOREIGN KEY ("importRowId") REFERENCES "money_import_row"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_entry" ADD CONSTRAINT "money_entry_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "money_transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_entry" ADD CONSTRAINT "money_entry_subAccountId_fkey" FOREIGN KEY ("subAccountId") REFERENCES "money_sub_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_entry" ADD CONSTRAINT "money_entry_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "money_category"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_lot" ADD CONSTRAINT "money_lot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "money_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_lot" ADD CONSTRAINT "money_lot_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "money_asset"("commodityId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_lot" ADD CONSTRAINT "money_lot_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "money_transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_lot" ADD CONSTRAINT "money_lot_openingEntryId_fkey" FOREIGN KEY ("openingEntryId") REFERENCES "money_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_lot" ADD CONSTRAINT "money_lot_parentLotId_fkey" FOREIGN KEY ("parentLotId") REFERENCES "money_lot"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_lot" ADD CONSTRAINT "money_lot_costCurrencyId_fkey" FOREIGN KEY ("costCurrencyId") REFERENCES "money_commodity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_lot" ADD CONSTRAINT "money_lot_tradeCurrencyId_fkey" FOREIGN KEY ("tradeCurrencyId") REFERENCES "money_commodity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_lot_consumption" ADD CONSTRAINT "money_lot_consumption_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "money_lot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_lot_consumption" ADD CONSTRAINT "money_lot_consumption_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "money_transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_price" ADD CONSTRAINT "money_price_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "money_asset"("commodityId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_price" ADD CONSTRAINT "money_price_quoteCurrencyId_fkey" FOREIGN KEY ("quoteCurrencyId") REFERENCES "money_commodity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_exchange_rate" ADD CONSTRAINT "money_exchange_rate_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "money_commodity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_exchange_rate" ADD CONSTRAINT "money_exchange_rate_toId_fkey" FOREIGN KEY ("toId") REFERENCES "money_commodity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_recurring_rule" ADD CONSTRAINT "money_recurring_rule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_snapshot" ADD CONSTRAINT "money_snapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_snapshot" ADD CONSTRAINT "money_snapshot_baseCurrencyId_fkey" FOREIGN KEY ("baseCurrencyId") REFERENCES "money_commodity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_import_batch" ADD CONSTRAINT "money_import_batch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_import_batch" ADD CONSTRAINT "money_import_batch_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "money_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_import_row" ADD CONSTRAINT "money_import_row_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "money_import_batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_api_token" ADD CONSTRAINT "money_api_token_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_audit_log" ADD CONSTRAINT "money_audit_log_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

