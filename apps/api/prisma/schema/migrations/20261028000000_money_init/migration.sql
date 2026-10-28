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
CREATE TYPE "money_transaction_status" AS ENUM ('posted', 'draft', 'template');

-- CreateEnum
CREATE TYPE "money_rate_source" AS ENUM ('ecb', 'nbp', 'manual');

-- CreateEnum
CREATE TYPE "money_price_source" AS ENUM ('manual', 'import', 'feed');

-- CreateEnum
CREATE TYPE "money_import_status" AS ENUM ('pending', 'mapped', 'duplicate', 'imported', 'skipped', 'error');

-- CreateEnum
CREATE TYPE "money_token_scope" AS ENUM ('read', 'draft');

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
    "unitName" TEXT NOT NULL DEFAULT 'units',
    "quoteCurrencyId" TEXT NOT NULL,
    "valuation" "money_valuation" NOT NULL DEFAULT 'manual',
    "valuationConfig" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "money_asset_pkey" PRIMARY KEY ("commodityId")
);

-- CreateTable
CREATE TABLE "money_asset_class" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
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
    "correctsId" TEXT,
    "recurringRuleId" TEXT,
    "importRowId" TEXT,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "money_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "money_lot" (
    "id" TEXT NOT NULL,
    "buyEntryId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "units" DECIMAL(28,10) NOT NULL,
    "remainingUnits" DECIMAL(28,10) NOT NULL,
    "costMinor" BIGINT NOT NULL,
    "costCurrencyId" TEXT NOT NULL,
    "costPlnMinor" BIGINT,
    "acquiredAt" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "money_lot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "money_lot_consumption" (
    "id" TEXT NOT NULL,
    "sellTransactionId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "units" DECIMAL(28,10) NOT NULL,
    "costAllocatedMinor" BIGINT NOT NULL,
    "costAllocatedPlnMinor" BIGINT,
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
    "templateTransactionId" TEXT NOT NULL,
    "schedule" TEXT NOT NULL,
    "nextRunAt" DATE NOT NULL,
    "autoPost" BOOLEAN NOT NULL DEFAULT false,
    "pausedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "money_recurring_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "money_import_batch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceProfile" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSha256" TEXT NOT NULL,
    "mapping" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "money_import_batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "money_import_row" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "raw" JSONB NOT NULL,
    "dedupeHash" TEXT NOT NULL,
    "status" "money_import_status" NOT NULL DEFAULT 'pending',
    "error" TEXT,
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
CREATE UNIQUE INDEX "money_transaction_importRowId_key" ON "money_transaction"("importRowId");

-- CreateIndex
CREATE INDEX "money_transaction_userId_status_date_idx" ON "money_transaction"("userId", "status", "date");

-- CreateIndex
CREATE INDEX "money_transaction_correctsId_idx" ON "money_transaction"("correctsId");

-- CreateIndex
CREATE INDEX "money_entry_transactionId_idx" ON "money_entry"("transactionId");

-- CreateIndex
CREATE INDEX "money_entry_subAccountId_idx" ON "money_entry"("subAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "money_lot_buyEntryId_key" ON "money_lot"("buyEntryId");

-- CreateIndex
CREATE INDEX "money_lot_accountId_assetId_acquiredAt_idx" ON "money_lot"("accountId", "assetId", "acquiredAt");

-- CreateIndex
CREATE INDEX "money_lot_consumption_lotId_idx" ON "money_lot_consumption"("lotId");

-- CreateIndex
CREATE UNIQUE INDEX "money_price_assetId_date_source_key" ON "money_price"("assetId", "date", "source");

-- CreateIndex
CREATE INDEX "money_exchange_rate_fromId_toId_date_idx" ON "money_exchange_rate"("fromId", "toId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "money_exchange_rate_source_date_fromId_toId_key" ON "money_exchange_rate"("source", "date", "fromId", "toId");

-- CreateIndex
CREATE UNIQUE INDEX "money_recurring_rule_templateTransactionId_key" ON "money_recurring_rule"("templateTransactionId");

-- CreateIndex
CREATE INDEX "money_recurring_rule_nextRunAt_idx" ON "money_recurring_rule"("nextRunAt");

-- CreateIndex
CREATE UNIQUE INDEX "money_import_batch_userId_fileSha256_key" ON "money_import_batch"("userId", "fileSha256");

-- CreateIndex
CREATE INDEX "money_import_row_dedupeHash_idx" ON "money_import_row"("dedupeHash");

-- CreateIndex
CREATE UNIQUE INDEX "money_import_row_batchId_rowNumber_key" ON "money_import_row"("batchId", "rowNumber");

-- CreateIndex
CREATE UNIQUE INDEX "money_api_token_tokenHash_key" ON "money_api_token"("tokenHash");

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
ALTER TABLE "money_lot" ADD CONSTRAINT "money_lot_buyEntryId_fkey" FOREIGN KEY ("buyEntryId") REFERENCES "money_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_lot" ADD CONSTRAINT "money_lot_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "money_asset"("commodityId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_lot" ADD CONSTRAINT "money_lot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "money_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_lot" ADD CONSTRAINT "money_lot_costCurrencyId_fkey" FOREIGN KEY ("costCurrencyId") REFERENCES "money_commodity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_lot_consumption" ADD CONSTRAINT "money_lot_consumption_sellTransactionId_fkey" FOREIGN KEY ("sellTransactionId") REFERENCES "money_transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_lot_consumption" ADD CONSTRAINT "money_lot_consumption_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "money_lot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE "money_recurring_rule" ADD CONSTRAINT "money_recurring_rule_templateTransactionId_fkey" FOREIGN KEY ("templateTransactionId") REFERENCES "money_transaction"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_import_batch" ADD CONSTRAINT "money_import_batch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_import_row" ADD CONSTRAINT "money_import_row_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "money_import_batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_api_token" ADD CONSTRAINT "money_api_token_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_audit_log" ADD CONSTRAINT "money_audit_log_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===== hand-written: rules the database enforces as well as the code =====

-- An entry carries exactly one of a currency amount (minor units) or an asset quantity.
ALTER TABLE "money_entry" ADD CONSTRAINT "money_entry_one_amount"
  CHECK (("amountMinor" IS NULL) <> ("quantity" IS NULL));
ALTER TABLE "money_entry" ADD CONSTRAINT "money_entry_nonzero"
  CHECK ("amountMinor" <> 0 OR "quantity" <> 0);

-- The amount column matches the kind of the sub-account's commodity.
CREATE FUNCTION money_entry_check_kind() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  k money_commodity_kind;
BEGIN
  SELECT c."kind" INTO k
    FROM "money_sub_account" s JOIN "money_commodity" c ON c."id" = s."commodityId"
   WHERE s."id" = NEW."subAccountId";
  IF (k = 'currency' AND NEW."amountMinor" IS NULL) OR (k = 'asset' AND NEW."quantity" IS NULL) THEN
    RAISE EXCEPTION 'money: entry amount does not match the % sub-account %', k, NEW."subAccountId"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "money_entry_check_kind"
  BEFORE INSERT OR UPDATE ON "money_entry"
  FOR EACH ROW EXECUTE FUNCTION money_entry_check_kind();

-- Rule 2: at commit, every transaction that received entries sums to zero per commodity.
CREATE FUNCTION money_entry_check_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  bad record;
BEGIN
  SELECT s."commodityId" AS commodity,
         COALESCE(SUM(e."amountMinor"), 0) AS minor,
         COALESCE(SUM(e."quantity"), 0) AS qty
    INTO bad
    FROM "money_entry" e JOIN "money_sub_account" s ON s."id" = e."subAccountId"
   WHERE e."transactionId" = NEW."transactionId"
   GROUP BY s."commodityId"
  HAVING COALESCE(SUM(e."amountMinor"), 0) <> 0 OR COALESCE(SUM(e."quantity"), 0) <> 0
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'money: transaction % does not balance in % (minor %, quantity %)',
      NEW."transactionId", bad.commodity, bad.minor, bad.qty
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER "money_entry_balanced"
  AFTER INSERT OR UPDATE ON "money_entry"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION money_entry_check_balanced();

-- Rule 4: posted transactions and their entries never change. Rows go away only
-- together with their user (the cascade deletes the user first, so it is gone here).
CREATE FUNCTION money_transaction_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" = 'posted' THEN
    IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u."id" = OLD."userId") THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'money: posted transaction % is immutable; post a correction instead', OLD."id"
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

CREATE TRIGGER "money_transaction_guard"
  BEFORE UPDATE OR DELETE ON "money_transaction"
  FOR EACH ROW EXECUTE FUNCTION money_transaction_guard();

CREATE FUNCTION money_entry_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "money_transaction" t JOIN "User" u ON u."id" = t."userId"
     WHERE t."id" = OLD."transactionId" AND t."status" = 'posted'
  ) THEN
    RAISE EXCEPTION 'money: entries of posted transaction % are immutable', OLD."transactionId"
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

CREATE TRIGGER "money_entry_guard"
  BEFORE UPDATE OR DELETE ON "money_entry"
  FOR EACH ROW EXECUTE FUNCTION money_entry_guard();

-- Entries can be added to a posted transaction only in the database transaction that posts it.
CREATE FUNCTION money_entry_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "money_transaction" t
     WHERE t."id" = NEW."transactionId" AND t."status" = 'posted'
       -- posted by an earlier database transaction (the row was not written by this one)
       AND t.xmin <> pg_current_xact_id()::xid
  ) THEN
    RAISE EXCEPTION 'money: posted transaction % is immutable', NEW."transactionId"
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "money_entry_insert_guard"
  BEFORE INSERT ON "money_entry"
  FOR EACH ROW EXECUTE FUNCTION money_entry_insert_guard();

-- Percentages stay within 0..100.
ALTER TABLE "money_asset_class_split" ADD CONSTRAINT "money_asset_class_split_percent"
  CHECK ("percent" > 0 AND "percent" <= 100);
ALTER TABLE "money_allocation_target" ADD CONSTRAINT "money_allocation_target_percent"
  CHECK ("percent" >= 0 AND "percent" <= 100);

-- Rule 6: every supported currency, ISO 4217 code and minor-unit digits.
INSERT INTO "money_commodity" ("id", "kind", "code", "name", "decimals") VALUES
  ('AED', 'currency', 'AED', 'United Arab Emirates Dirham', 2),
  ('AFN', 'currency', 'AFN', 'Afghan Afghani', 2),
  ('ALL', 'currency', 'ALL', 'Albanian Lek', 2),
  ('AMD', 'currency', 'AMD', 'Armenian Dram', 2),
  ('AOA', 'currency', 'AOA', 'Angolan Kwanza', 2),
  ('ARS', 'currency', 'ARS', 'Argentine Peso', 2),
  ('AUD', 'currency', 'AUD', 'Australian Dollar', 2),
  ('AWG', 'currency', 'AWG', 'Aruban Florin', 2),
  ('AZN', 'currency', 'AZN', 'Azerbaijani Manat', 2),
  ('BAM', 'currency', 'BAM', 'Bosnia-Herzegovina Convertible Mark', 2),
  ('BBD', 'currency', 'BBD', 'Barbadian Dollar', 2),
  ('BDT', 'currency', 'BDT', 'Bangladeshi Taka', 2),
  ('BGN', 'currency', 'BGN', 'Bulgarian Lev', 2),
  ('BHD', 'currency', 'BHD', 'Bahraini Dinar', 3),
  ('BIF', 'currency', 'BIF', 'Burundian Franc', 0),
  ('BMD', 'currency', 'BMD', 'Bermudan Dollar', 2),
  ('BND', 'currency', 'BND', 'Brunei Dollar', 2),
  ('BOB', 'currency', 'BOB', 'Bolivian Boliviano', 2),
  ('BRL', 'currency', 'BRL', 'Brazilian Real', 2),
  ('BSD', 'currency', 'BSD', 'Bahamian Dollar', 2),
  ('BTN', 'currency', 'BTN', 'Bhutanese Ngultrum', 2),
  ('BWP', 'currency', 'BWP', 'Botswanan Pula', 2),
  ('BYN', 'currency', 'BYN', 'Belarusian Ruble', 2),
  ('BZD', 'currency', 'BZD', 'Belize Dollar', 2),
  ('CAD', 'currency', 'CAD', 'Canadian Dollar', 2),
  ('CDF', 'currency', 'CDF', 'Congolese Franc', 2),
  ('CHF', 'currency', 'CHF', 'Swiss Franc', 2),
  ('CLP', 'currency', 'CLP', 'Chilean Peso', 0),
  ('CNY', 'currency', 'CNY', 'Chinese Yuan', 2),
  ('COP', 'currency', 'COP', 'Colombian Peso', 2),
  ('CRC', 'currency', 'CRC', 'Costa Rican Colón', 2),
  ('CUP', 'currency', 'CUP', 'Cuban Peso', 2),
  ('CVE', 'currency', 'CVE', 'Cape Verdean Escudo', 2),
  ('CZK', 'currency', 'CZK', 'Czech Koruna', 2),
  ('DJF', 'currency', 'DJF', 'Djiboutian Franc', 0),
  ('DKK', 'currency', 'DKK', 'Danish Krone', 2),
  ('DOP', 'currency', 'DOP', 'Dominican Peso', 2),
  ('DZD', 'currency', 'DZD', 'Algerian Dinar', 2),
  ('EGP', 'currency', 'EGP', 'Egyptian Pound', 2),
  ('ERN', 'currency', 'ERN', 'Eritrean Nakfa', 2),
  ('ETB', 'currency', 'ETB', 'Ethiopian Birr', 2),
  ('EUR', 'currency', 'EUR', 'Euro', 2),
  ('FJD', 'currency', 'FJD', 'Fijian Dollar', 2),
  ('FKP', 'currency', 'FKP', 'Falkland Islands Pound', 2),
  ('GBP', 'currency', 'GBP', 'British Pound', 2),
  ('GEL', 'currency', 'GEL', 'Georgian Lari', 2),
  ('GHS', 'currency', 'GHS', 'Ghanaian Cedi', 2),
  ('GIP', 'currency', 'GIP', 'Gibraltar Pound', 2),
  ('GMD', 'currency', 'GMD', 'Gambian Dalasi', 2),
  ('GNF', 'currency', 'GNF', 'Guinean Franc', 0),
  ('GTQ', 'currency', 'GTQ', 'Guatemalan Quetzal', 2),
  ('GYD', 'currency', 'GYD', 'Guyanaese Dollar', 2),
  ('HKD', 'currency', 'HKD', 'Hong Kong Dollar', 2),
  ('HNL', 'currency', 'HNL', 'Honduran Lempira', 2),
  ('HTG', 'currency', 'HTG', 'Haitian Gourde', 2),
  ('HUF', 'currency', 'HUF', 'Hungarian Forint', 2),
  ('IDR', 'currency', 'IDR', 'Indonesian Rupiah', 2),
  ('ILS', 'currency', 'ILS', 'Israeli New Shekel', 2),
  ('INR', 'currency', 'INR', 'Indian Rupee', 2),
  ('IQD', 'currency', 'IQD', 'Iraqi Dinar', 3),
  ('IRR', 'currency', 'IRR', 'Iranian Rial', 2),
  ('ISK', 'currency', 'ISK', 'Icelandic Króna', 0),
  ('JMD', 'currency', 'JMD', 'Jamaican Dollar', 2),
  ('JOD', 'currency', 'JOD', 'Jordanian Dinar', 3),
  ('JPY', 'currency', 'JPY', 'Japanese Yen', 0),
  ('KES', 'currency', 'KES', 'Kenyan Shilling', 2),
  ('KGS', 'currency', 'KGS', 'Kyrgystani Som', 2),
  ('KHR', 'currency', 'KHR', 'Cambodian Riel', 2),
  ('KMF', 'currency', 'KMF', 'Comorian Franc', 0),
  ('KPW', 'currency', 'KPW', 'North Korean Won', 2),
  ('KRW', 'currency', 'KRW', 'South Korean Won', 0),
  ('KWD', 'currency', 'KWD', 'Kuwaiti Dinar', 3),
  ('KYD', 'currency', 'KYD', 'Cayman Islands Dollar', 2),
  ('KZT', 'currency', 'KZT', 'Kazakhstani Tenge', 2),
  ('LAK', 'currency', 'LAK', 'Laotian Kip', 2),
  ('LBP', 'currency', 'LBP', 'Lebanese Pound', 2),
  ('LKR', 'currency', 'LKR', 'Sri Lankan Rupee', 2),
  ('LRD', 'currency', 'LRD', 'Liberian Dollar', 2),
  ('LSL', 'currency', 'LSL', 'Lesotho Loti', 2),
  ('LYD', 'currency', 'LYD', 'Libyan Dinar', 3),
  ('MAD', 'currency', 'MAD', 'Moroccan Dirham', 2),
  ('MDL', 'currency', 'MDL', 'Moldovan Leu', 2),
  ('MGA', 'currency', 'MGA', 'Malagasy Ariary', 2),
  ('MKD', 'currency', 'MKD', 'Macedonian Denar', 2),
  ('MMK', 'currency', 'MMK', 'Myanmar Kyat', 2),
  ('MNT', 'currency', 'MNT', 'Mongolian Tugrik', 2),
  ('MOP', 'currency', 'MOP', 'Macanese Pataca', 2),
  ('MRU', 'currency', 'MRU', 'Mauritanian Ouguiya', 2),
  ('MUR', 'currency', 'MUR', 'Mauritian Rupee', 2),
  ('MVR', 'currency', 'MVR', 'Maldivian Rufiyaa', 2),
  ('MWK', 'currency', 'MWK', 'Malawian Kwacha', 2),
  ('MXN', 'currency', 'MXN', 'Mexican Peso', 2),
  ('MYR', 'currency', 'MYR', 'Malaysian Ringgit', 2),
  ('MZN', 'currency', 'MZN', 'Mozambican Metical', 2),
  ('NAD', 'currency', 'NAD', 'Namibian Dollar', 2),
  ('NGN', 'currency', 'NGN', 'Nigerian Naira', 2),
  ('NIO', 'currency', 'NIO', 'Nicaraguan Córdoba', 2),
  ('NOK', 'currency', 'NOK', 'Norwegian Krone', 2),
  ('NPR', 'currency', 'NPR', 'Nepalese Rupee', 2),
  ('NZD', 'currency', 'NZD', 'New Zealand Dollar', 2),
  ('OMR', 'currency', 'OMR', 'Omani Rial', 3),
  ('PAB', 'currency', 'PAB', 'Panamanian Balboa', 2),
  ('PEN', 'currency', 'PEN', 'Peruvian Sol', 2),
  ('PGK', 'currency', 'PGK', 'Papua New Guinean Kina', 2),
  ('PHP', 'currency', 'PHP', 'Philippine Peso', 2),
  ('PKR', 'currency', 'PKR', 'Pakistani Rupee', 2),
  ('PLN', 'currency', 'PLN', 'Polish Zloty', 2),
  ('PYG', 'currency', 'PYG', 'Paraguayan Guarani', 0),
  ('QAR', 'currency', 'QAR', 'Qatari Riyal', 2),
  ('RON', 'currency', 'RON', 'Romanian Leu', 2),
  ('RSD', 'currency', 'RSD', 'Serbian Dinar', 2),
  ('RUB', 'currency', 'RUB', 'Russian Ruble', 2),
  ('RWF', 'currency', 'RWF', 'Rwandan Franc', 0),
  ('SAR', 'currency', 'SAR', 'Saudi Riyal', 2),
  ('SBD', 'currency', 'SBD', 'Solomon Islands Dollar', 2),
  ('SCR', 'currency', 'SCR', 'Seychellois Rupee', 2),
  ('SDG', 'currency', 'SDG', 'Sudanese Pound', 2),
  ('SEK', 'currency', 'SEK', 'Swedish Krona', 2),
  ('SGD', 'currency', 'SGD', 'Singapore Dollar', 2),
  ('SHP', 'currency', 'SHP', 'St. Helena Pound', 2),
  ('SLE', 'currency', 'SLE', 'Sierra Leonean Leone', 2),
  ('SOS', 'currency', 'SOS', 'Somali Shilling', 2),
  ('SRD', 'currency', 'SRD', 'Surinamese Dollar', 2),
  ('SSP', 'currency', 'SSP', 'South Sudanese Pound', 2),
  ('STN', 'currency', 'STN', 'São Tomé & Príncipe Dobra', 2),
  ('SVC', 'currency', 'SVC', 'Salvadoran Colón', 2),
  ('SYP', 'currency', 'SYP', 'Syrian Pound', 2),
  ('SZL', 'currency', 'SZL', 'Swazi Lilangeni', 2),
  ('THB', 'currency', 'THB', 'Thai Baht', 2),
  ('TJS', 'currency', 'TJS', 'Tajikistani Somoni', 2),
  ('TMT', 'currency', 'TMT', 'Turkmenistani Manat', 2),
  ('TND', 'currency', 'TND', 'Tunisian Dinar', 3),
  ('TOP', 'currency', 'TOP', 'Tongan Paʻanga', 2),
  ('TRY', 'currency', 'TRY', 'Turkish Lira', 2),
  ('TTD', 'currency', 'TTD', 'Trinidad & Tobago Dollar', 2),
  ('TWD', 'currency', 'TWD', 'New Taiwan Dollar', 2),
  ('TZS', 'currency', 'TZS', 'Tanzanian Shilling', 2),
  ('UAH', 'currency', 'UAH', 'Ukrainian Hryvnia', 2),
  ('UGX', 'currency', 'UGX', 'Ugandan Shilling', 0),
  ('USD', 'currency', 'USD', 'US Dollar', 2),
  ('UYU', 'currency', 'UYU', 'Uruguayan Peso', 2),
  ('UZS', 'currency', 'UZS', 'Uzbekistani Som', 2),
  ('VES', 'currency', 'VES', 'Venezuelan Bolívar', 2),
  ('VND', 'currency', 'VND', 'Vietnamese Dong', 0),
  ('VUV', 'currency', 'VUV', 'Vanuatu Vatu', 0),
  ('WST', 'currency', 'WST', 'Samoan Tala', 2),
  ('XAF', 'currency', 'XAF', 'Central African CFA Franc', 0),
  ('XCD', 'currency', 'XCD', 'East Caribbean Dollar', 2),
  ('XCG', 'currency', 'XCG', 'Caribbean guilder', 2),
  ('XOF', 'currency', 'XOF', 'West African CFA Franc', 0),
  ('XPF', 'currency', 'XPF', 'CFP Franc', 0),
  ('YER', 'currency', 'YER', 'Yemeni Rial', 2),
  ('ZAR', 'currency', 'ZAR', 'South African Rand', 2),
  ('ZMW', 'currency', 'ZMW', 'Zambian Kwacha', 2),
  ('ZWG', 'currency', 'ZWG', 'Zimbabwean Gold', 2);
