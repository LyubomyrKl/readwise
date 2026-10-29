-- Fixes to the money rules of 20261028000001_money_rules, found in review.

-- A zero entry is refused. One of the two columns is always NULL, and "x <> 0" on a
-- NULL is NULL, which a CHECK lets through: compare what is there.
ALTER TABLE "money_entry" DROP CONSTRAINT "money_entry_nonzero";
ALTER TABLE "money_entry" ADD CONSTRAINT "money_entry_nonzero"
  CHECK (COALESCE("amountMinor", 0) <> 0 OR COALESCE("quantity", 0) <> 0);

-- Rule 4: only the database transaction that posted a transaction may add its entries.
-- The guard used the row's xmin, which any later update rewrites (even a no-op one, or
-- the SET NULL of a deleted recurring rule or import row), so a later database
-- transaction could update the row and then add entries. The posting transaction is
-- now recorded on the row and nothing else can change it.
ALTER TABLE "money_transaction" ADD COLUMN "postedXact" BIGINT;

CREATE FUNCTION money_transaction_mark_posting() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."status" = 'posted' AND (TG_OP = 'INSERT' OR OLD."status" IS DISTINCT FROM 'posted') THEN
    NEW."postedXact" := pg_current_xact_id()::text::bigint;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW."postedXact" := OLD."postedXact";
  ELSE
    NEW."postedXact" := NULL;
  END IF;
  RETURN NEW;
END $$;

-- after money_transaction_guard (BEFORE triggers run in name order)
CREATE TRIGGER "money_transaction_mark_posting"
  BEFORE INSERT OR UPDATE ON "money_transaction"
  FOR EACH ROW EXECUTE FUNCTION money_transaction_mark_posting();

CREATE OR REPLACE FUNCTION money_entry_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  st money_transaction_status;
  writer bigint;
BEGIN
  SELECT t."status", t."postedXact" INTO st, writer FROM "money_transaction" t WHERE t."id" = NEW."transactionId";
  IF st IS DISTINCT FROM 'posted' THEN
    RAISE EXCEPTION 'money: entries belong to posted transactions only (transaction % is %)', NEW."transactionId", st
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF writer IS DISTINCT FROM pg_current_xact_id()::text::bigint THEN
    RAISE EXCEPTION 'money: posted transaction % is immutable', NEW."transactionId"
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$;

-- Deleting means reversing, once: a second reversal of the same transaction would
-- undo the undo.
CREATE UNIQUE INDEX "money_transaction_one_reversal" ON "money_transaction" ("correctsId") WHERE "kind" = 'correction';
