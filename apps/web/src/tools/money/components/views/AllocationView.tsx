"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { absValue, formatAmount, formatDate, isNegative, isZero, percent } from "../../lib/format";
import { useAllocation } from "../../queries";
import { MONEY_ROUTES } from "../../routes";
import type { AllocationResponse, AllocationRow } from "../../types";
import { TargetMeter } from "../charts/Bars";
import { ChartFrame, DataTable } from "../charts/ChartFrame";
import { MissingRates } from "./NetWorthView";

const ACTUAL_COLOR = "var(--viz-1)";

function driftText(row: AllocationRow): string | null {
  if (row.drift === null || row.driftAmount === null) return null;
  if (isZero(row.drift) && isZero(row.driftAmount.value)) return "on target";
  const points = `${row.drift.startsWith("-") ? "−" : "+"}${absValue(row.drift)} pts`;
  const amount = formatAmount({ ...row.driftAmount, value: absValue(row.driftAmount.value) });
  return isNegative(row.driftAmount.value) ? `${points} · ${amount} to buy` : `${points} · ${amount} above`;
}

/** Each class against its target: the bar is the actual share, the tick the target. */
export function AllocationRows({ allocation }: { allocation: AllocationResponse }) {
  if (allocation.rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No asset classes yet. Set them up under{" "}
        <Link className="underline underline-offset-4" href={MONEY_ROUTES.assets}>
          Assets and classes
        </Link>
        .
      </p>
    );
  }
  return (
    <ul className="space-y-4">
      {allocation.rows.map((r) => {
        const drift = driftText(r);
        return (
          <li key={r.classId ?? "none"} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate font-medium">{r.name}</span>
              <span className="shrink-0 tabular-nums">
                {r.percent !== null ? percent(r.percent) : "—"}
                {r.targetPercent !== null ? <span className="text-muted-foreground"> of {percent(r.targetPercent, 0)} target</span> : null}
              </span>
            </div>
            <TargetMeter
              percent={r.percent === null ? 0 : Number(r.percent)}
              target={r.targetPercent === null ? null : Number(r.targetPercent)}
              color={ACTUAL_COLOR}
              label={`${r.name}: ${r.percent ?? 0}% held${r.targetPercent !== null ? `, target ${r.targetPercent}%` : ""}`}
            />
            <div className="flex justify-between gap-3 text-xs text-muted-foreground">
              <span className="tabular-nums">{formatAmount(r.value)}</span>
              {drift ? <span className="tabular-nums">{drift}</span> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function AllocationView({ base }: { base?: string }) {
  const allocation = useAllocation(base);
  if (allocation.isLoading || !allocation.data) return <Skeleton className="h-72" />;
  const a = allocation.data;
  const targets = a.targetsTotal;
  return (
    <Card className={cn("transition-opacity", allocation.isPlaceholderData && "opacity-60")}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Allocation against target</CardTitle>
        <p className="text-xs text-muted-foreground">
          {formatAmount(a.total)} owned on {formatDate(a.asOf)}, debts aside. The bar is the share held, the tick the target.{" "}
          <Link className="underline underline-offset-4" href={MONEY_ROUTES.assets}>
            Change targets
          </Link>
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <MissingRates currencies={a.missingRates} base={a.base} />
        {targets !== null && targets !== "100" ? (
          <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">The targets add up to {percent(targets, 0)}, not 100%.</p>
        ) : null}
        <ChartFrame
          title="By class"
          table={
            <DataTable
              head={["Class", "Value", "Held", "Target", "Drift", "To target"]}
              rows={a.rows.map((r) => ({
                key: r.classId ?? "none",
                cells: [
                  r.name,
                  formatAmount(r.value),
                  r.percent !== null ? percent(r.percent) : "—",
                  r.targetPercent !== null ? percent(r.targetPercent, 0) : "—",
                  r.drift !== null ? `${r.drift} pts` : "—",
                  r.driftAmount ? formatAmount(r.driftAmount) : "—",
                ],
              }))}
            />
          }
        >
          <AllocationRows allocation={a} />
        </ChartFrame>
      </CardContent>
    </Card>
  );
}
