-- Money rules the database enforces as well as the code (CLAUDE.md, docs/money/plan.md).
-- Hand-written: Prisma does not model checks, triggers or seed data.

-- ---- entries -------------------------------------------------------------------

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
  BEFORE INSERT ON "money_entry"
  FOR EACH ROW EXECUTE FUNCTION money_entry_check_kind();

-- Entries belong to posted transactions only, and only the database transaction
-- that posts a transaction may add its entries (rule 4: posted means final).
CREATE FUNCTION money_entry_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  st money_transaction_status;
  writer xid;
BEGIN
  SELECT t."status", t.xmin INTO st, writer FROM "money_transaction" t WHERE t."id" = NEW."transactionId";
  IF st IS DISTINCT FROM 'posted' THEN
    RAISE EXCEPTION 'money: entries belong to posted transactions only (transaction % is %)', NEW."transactionId", st
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF writer <> pg_current_xact_id()::xid THEN
    RAISE EXCEPTION 'money: posted transaction % is immutable', NEW."transactionId"
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "money_entry_insert_guard"
  BEFORE INSERT ON "money_entry"
  FOR EACH ROW EXECUTE FUNCTION money_entry_insert_guard();

-- Entries never change. They disappear only together with their user (the cascade
-- deletes the user, then the transaction, so neither is visible any more here).
CREATE FUNCTION money_entry_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (
    SELECT 1 FROM "money_transaction" t JOIN "User" u ON u."id" = t."userId"
     WHERE t."id" = OLD."transactionId"
  ) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'money: entries of posted transaction % are immutable', OLD."transactionId"
    USING ERRCODE = 'integrity_constraint_violation';
END $$;

CREATE TRIGGER "money_entry_guard"
  BEFORE UPDATE OR DELETE ON "money_entry"
  FOR EACH ROW EXECUTE FUNCTION money_entry_guard();

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
  AFTER INSERT ON "money_entry"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION money_entry_check_balanced();

-- ---- transactions ----------------------------------------------------------------

-- Rule 4: a posted transaction never changes; a draft may be edited, posted or dropped.
-- A posted row goes away only together with its user (the cascade deletes the user first).
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

-- At commit, a posted transaction has at least two entries; a draft carries its proposal.
CREATE FUNCTION money_transaction_check_complete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "money_transaction" t WHERE t."id" = NEW."id") THEN
    RETURN NULL;
  END IF;
  IF NEW."status" = 'posted' AND (SELECT count(*) FROM "money_entry" e WHERE e."transactionId" = NEW."id") < 2 THEN
    RAISE EXCEPTION 'money: posted transaction % has fewer than two entries', NEW."id"
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."status" = 'draft' AND NEW."draft" IS NULL THEN
    RAISE EXCEPTION 'money: draft % has no proposal', NEW."id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER "money_transaction_complete"
  AFTER INSERT OR UPDATE ON "money_transaction"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION money_transaction_check_complete();

-- ---- lots and percentages ---------------------------------------------------------

ALTER TABLE "money_lot" ADD CONSTRAINT "money_lot_units"
  CHECK ("units" > 0 AND "remainingUnits" >= 0 AND "remainingUnits" <= "units");
ALTER TABLE "money_lot" ADD CONSTRAINT "money_lot_cost"
  CHECK ("costMinor" >= 0 AND "remainingCostMinor" >= 0 AND "remainingCostMinor" <= "costMinor");
ALTER TABLE "money_lot_consumption" ADD CONSTRAINT "money_lot_consumption_units"
  CHECK ("units" > 0 AND "costAllocatedMinor" >= 0);

ALTER TABLE "money_asset_class_split" ADD CONSTRAINT "money_asset_class_split_percent"
  CHECK ("percent" > 0 AND "percent" <= 100);
ALTER TABLE "money_allocation_target" ADD CONSTRAINT "money_allocation_target_percent"
  CHECK ("percent" >= 0 AND "percent" <= 100);
ALTER TABLE "money_exchange_rate" ADD CONSTRAINT "money_exchange_rate_positive"
  CHECK ("rate" > 0);
ALTER TABLE "money_price" ADD CONSTRAINT "money_price_nonnegative"
  CHECK ("price" >= 0);

-- ---- currencies ---------------------------------------------------------------------

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
