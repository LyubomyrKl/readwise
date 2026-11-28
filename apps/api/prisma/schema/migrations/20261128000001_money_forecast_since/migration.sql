-- The first month the forecasts learn from, when things changed (a tax began, a new job); null: the
-- last twelve months. Only the forecast reads it.
-- AlterTable
ALTER TABLE "money_settings" ADD COLUMN     "forecastSince" DATE;
