"use client";

import Link from "next/link";
import { TrendingUp } from "lucide-react";
import { formatAmount, isZero } from "../../lib/format";
import { useForecast } from "../../queries";
import { MONEY_ROUTES } from "../../routes";
import { Change } from "./Change";

/** One line on the Overview: where this month's spending is heading, and the way to Insights. */
export function PaceNote({ base }: { base?: string }) {
  const { data: f } = useForecast(base);
  if (!f || (f.basisMonths === 0 && isZero(f.expenses.soFar.value))) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-muted/40 px-3 py-2 text-sm">
      <TrendingUp className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <span>
        Spending is on pace for <strong className="tabular-nums">{formatAmount(f.expenses.projected)}</strong> this month
        {f.expenses.typicalMonth ? <span className="text-muted-foreground">, usually {formatAmount(f.expenses.typicalMonth)}</span> : null}
      </span>
      <Change change={f.expenses.change} kind="expense" />
      <Link href={`${MONEY_ROUTES.insights}${base ? `?base=${base}` : ""}`} className="ml-auto text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
        Insights
      </Link>
    </div>
  );
}
