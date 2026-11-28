"use client";

import Link from "next/link";
import { TrendingUp } from "lucide-react";
import { formatAmount, isZero } from "../../lib/format";
import { useForecast } from "../../queries";
import { MONEY_ROUTES } from "../../routes";

/** The note under the Overview's Expenses: where this month's spending is heading, the way to Insights. */
export function ExpensesPace({ base }: { base?: string }) {
  const { data: f } = useForecast(base);
  if (!f || (f.method === "pace" && isZero(f.expenses.soFar.value))) return null;
  const nothingYet = f.method === "history" && f.recordedThrough === 0;
  return (
    <Link
      href={`${MONEY_ROUTES.insights}${base ? `?base=${base}` : ""}`}
      title="Where this month is heading, on Insights"
      className="underline-offset-4 hover:text-foreground hover:underline"
    >
      {/* inline, so a narrow column wraps the words and keeps the amount whole */}
      <TrendingUp className="mr-1 inline-block h-3 w-3 align-[-0.125em]" aria-hidden />
      {nothingYet ? "usually " : "on pace for "}
      <span className="whitespace-nowrap tabular-nums">{formatAmount(f.expenses.projected)}</span>
    </Link>
  );
}
