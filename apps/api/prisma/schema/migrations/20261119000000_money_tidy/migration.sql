-- AlterTable
ALTER TABLE "money_account" ADD COLUMN     "position" INTEGER;

-- AlterTable
ALTER TABLE "money_category" ADD COLUMN     "mergedIntoId" TEXT;

-- AddForeignKey
ALTER TABLE "money_category" ADD CONSTRAINT "money_category_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "money_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---- hand-written below ------------------------------------------------------------------

-- The history from the old money app brought its own names for categories the ledger already
-- had (Transportation next to Transport, Other next to Other expenses, ...). Each is merged into
-- the one in use. Merging only points the category at the other one ("mergedIntoId"): posted
-- transactions and entries keep their rows untouched (rule 4), and the lists, filters, views and
-- new movements follow the pointer. A pair is merged only when both exist for the user, are top
-- level and of the same kind, and a built-in category (key) is never the one merged away.
-- Returns how many categories were merged; a second run merges nothing.
CREATE FUNCTION money_merge_import_duplicates() RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  merged integer;
BEGIN
  WITH pairs(kind, source, target_name, target_key) AS (
    VALUES ('expense', 'Transportation', 'Transport', NULL),
           ('expense', 'Housing', 'Home', NULL),
           ('expense', 'Shopping', 'Clothing, shopping', NULL),
           ('expense', 'Other', NULL, 'other_expense'),
           ('income', 'Other', NULL, 'other_income')
  ),
  matched AS (
    SELECT DISTINCT ON (s."id") s."id" AS source_id, t."id" AS target_id
      FROM pairs p
      JOIN "money_category" s
        ON s."kind"::text = p.kind AND lower(s."name") = lower(p.source)
       AND s."parentId" IS NULL AND s."key" IS NULL AND s."mergedIntoId" IS NULL
      JOIN "money_category" t
        ON t."userId" = s."userId" AND t."kind" = s."kind" AND t."id" <> s."id"
       AND t."parentId" IS NULL AND t."mergedIntoId" IS NULL
       AND CASE WHEN p.target_key IS NOT NULL THEN t."key" = p.target_key
                ELSE lower(t."name") = lower(p.target_name) END
     ORDER BY s."id", t."createdAt", t."id"
  ),
  done AS (
    UPDATE "money_category" c SET "mergedIntoId" = m.target_id
      FROM matched m
     WHERE c."id" = m.source_id
    RETURNING c."id", m.target_id
  ),
  -- subcategories go with their parent
  moved AS (
    UPDATE "money_category" ch SET "parentId" = d.target_id FROM done d WHERE ch."parentId" = d."id"
  )
  SELECT count(*) INTO merged FROM done;
  RETURN merged;
END $$;

SELECT money_merge_import_duplicates();
