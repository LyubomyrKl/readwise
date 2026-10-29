-- The account number moves from the account to each currency (mBank PLN and mBank USD have their own IBAN).

-- AlterTable
ALTER TABLE "money_sub_account" ADD COLUMN     "number" TEXT;

-- Backfill: an account's number goes to each of its currency sub-accounts (not to asset holdings)
UPDATE "money_sub_account" s
   SET "number" = a."number"
  FROM "money_account" a, "money_commodity" c
 WHERE a."id" = s."accountId"
   AND c."id" = s."commodityId"
   AND c."kind" = 'currency'
   AND a."number" IS NOT NULL;

-- AlterTable
ALTER TABLE "money_account" DROP COLUMN "number";
