-- What investments are expected to earn a year, in percent. Only the forecast reads it: net worth
-- ahead grows what is invested today at this rate (0, the default: not at all).
-- AlterTable
ALTER TABLE "money_settings" ADD COLUMN     "expectedReturn" DECIMAL(4,2) NOT NULL DEFAULT 0;
