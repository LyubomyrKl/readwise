-- The overview on real money (docs/money/plan.md, Progress).

-- Money lent out is its own kind of account: its own line of what you own, outside the allocation.
ALTER TYPE "money_account_type" ADD VALUE 'lent';

-- An account's class now covers everything it holds (cash and units), not only its cash: renamed,
-- not dropped and added, so the classes already chosen stay.
ALTER TABLE "money_account" RENAME COLUMN "cashClassId" TO "classId";
ALTER TABLE "money_account" RENAME CONSTRAINT "money_account_cashClassId_fkey" TO "money_account_classId_fkey";

-- A category can be left out of the month's income and expenses and the savings rate.
ALTER TABLE "money_category" ADD COLUMN "leftOutOfTotals" BOOLEAN NOT NULL DEFAULT false;

-- Selling something you own is not income: every user who has categories gets "Sold belongings",
-- left out of the totals (new users get it with the default categories).
INSERT INTO "money_category" ("id", "userId", "name", "kind", "leftOutOfTotals", "createdAt")
SELECT 'cat_sold_' || md5(u."userId"), u."userId", 'Sold belongings', 'income', true, now()
  FROM (SELECT DISTINCT "userId" FROM "money_category") u
 WHERE NOT EXISTS (
   SELECT 1 FROM "money_category" c
    WHERE c."userId" = u."userId" AND c."kind" = 'income' AND lower(c."name") = 'sold belongings'
 );
