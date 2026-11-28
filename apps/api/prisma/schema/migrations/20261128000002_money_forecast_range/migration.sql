-- Which months the forecasts learn from: the last month, 3, 6 or 12 months, this year, or a custom
-- range (forecastSince to forecastUntil, open when forecastUntil is null).
-- CreateEnum
CREATE TYPE "money_forecast_range" AS ENUM ('last_month', 'last_3_months', 'last_6_months', 'last_12_months', 'this_year', 'custom');

-- AlterTable
ALTER TABLE "money_settings" ADD COLUMN     "forecastRange" "money_forecast_range" NOT NULL DEFAULT 'last_12_months',
ADD COLUMN     "forecastUntil" DATE;

-- a start already chosen is a custom range open at its end
UPDATE "money_settings" SET "forecastRange" = 'custom' WHERE "forecastSince" IS NOT NULL;
