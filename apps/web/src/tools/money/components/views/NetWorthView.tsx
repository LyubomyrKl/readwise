"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { shortMonth } from "../../lib/chart";
import { formatAmount, formatDate } from "../../lib/format";
import { trimLeadingEmpty } from "../../lib/views";
import { useHistory, useNetWorth } from "../../queries";
import { MONEY_ROUTES } from "../../routes";
import type { NamedValue, NetWorthResponse } from "../../types";
import { Amount, Units } from "../Amount";
import { Segmented } from "../Fields";
import { TooltipRows } from "../charts/Bars";
import { ChartFrame, DataTable } from "../charts/ChartFrame";
import { LineChart } from "../charts/LineChart";

const VALUED_BY: Record<string, string> = {
  balance: "balance",
  price: "price",
  bond_formula: "bond formula",
  cost: "at cost",
  none: "no value",
};

export function MissingRates({ currencies, base }: { currencies: string[]; base: string }) {
  if (currencies.length === 0) return null;
  return (
    <p className="flex items-start gap-2 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      No exchange rate from {currencies.join(", ")} to {base} yet; {currencies.length === 1 ? "it is" : "they are"} left out of the totals.
    </p>
  );
}

/** The headline: net worth, then what is owned and what is owed. */
export function NetWorthHeadline({ nw, className }: { nw: NetWorthResponse; className?: string }) {
  return (
    <div className={cn("space-y-3", className)}>
      <div>
        <div className="break-words text-3xl font-semibold tracking-tight sm:text-4xl">{formatAmount(nw.total)}</div>
        <div className="mt-1 text-xs text-muted-foreground">
          Net worth on {formatDate(nw.asOf)}
          {nw.rateDate && nw.rateDate !== nw.asOf ? ` · rates of ${formatDate(nw.rateDate)}` : ""}
        </div>
      </div>
      <dl className="grid max-w-md grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Owned</dt>
          <dd className="text-lg font-medium">{formatAmount(nw.assets)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Owed</dt>
          <dd className="text-lg font-medium">{formatAmount(nw.liabilities)}</dd>
        </div>
      </dl>
    </div>
  );
}

type By = "account" | "currency" | "type" | "class";

export function NetWorthView({ base, from }: { base?: string; from: string }) {
  const nw = useNetWorth(base);
  const history = useHistory(base, from);
  const [by, setBy] = useState<By>("account");

  if (nw.isLoading || !nw.data) return <Skeleton className="h-96" />;
  const data = nw.data;
  const points = trimLeadingEmpty(history.data?.points ?? []);

  return (
    <div className={cn("space-y-6 transition-opacity", nw.isPlaceholderData && "opacity-60")}>
      <Card>
        <CardContent className="space-y-6">
          <NetWorthHeadline nw={data} />
          <MissingRates currencies={data.missingRates} base={data.base} />
          <ChartFrame
            title={`Net worth over time, ${data.base}`}
            description="At each month end; the current month at today."
            dimmed={history.isPlaceholderData}
            table={
              <DataTable
                head={["Month end", "Net worth", "Owned", "Owed"]}
                rows={points.map((p) => ({
                  key: p.date,
                  cells: [formatDate(p.date), <Amount key="t" amount={p.total} />, <Amount key="a" amount={p.assets} />, <Amount key="l" amount={p.liabilities} />],
                }))}
              />
            }
          >
            {history.isLoading ? (
              <Skeleton className="h-60" />
            ) : (
              <LineChart
                label={`Net worth in ${data.base} at each month end`}
                color="var(--viz-1)"
                points={points.map((p) => ({ key: p.date, label: shortMonth(p.date), value: Number(p.total.value) }))}
                tooltip={(i) => (
                  <TooltipRows
                    title={formatDate(points[i].date)}
                    rows={[
                      { label: "Net worth", value: formatAmount(points[i].total), strong: true },
                      { label: "Owned", value: formatAmount(points[i].assets) },
                      { label: "Owed", value: formatAmount(points[i].liabilities) },
                    ]}
                  />
                )}
              />
            )}
          </ChartFrame>
          {history.data ? <MissingRates currencies={history.data.missingRates.filter((c) => !data.missingRates.includes(c))} base={data.base} /> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
          <CardTitle className="text-base">Breakdown</CardTitle>
          <Segmented
            value={by}
            onChange={setBy}
            options={[
              { value: "account", label: "Account" },
              { value: "currency", label: "Currency" },
              { value: "type", label: "Type" },
              { value: "class", label: "Class" },
            ]}
          />
        </CardHeader>
        <CardContent>
          {by === "account" ? <ByAccount nw={data} /> : <ByNamed rows={by === "currency" ? data.currencies : by === "type" ? data.types : data.classes} native={by === "currency"} />}
        </CardContent>
      </Card>
    </div>
  );
}

function ByNamed({ rows, native }: { rows: NamedValue[]; native: boolean }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Nothing held yet.</p>;
  return (
    <DataTable
      head={native ? ["", "Held", "Value"] : ["", "Value"]}
      rows={rows.map((r) => ({
        key: r.key ?? r.name,
        cells: native ? [r.name, <Amount key="n" amount={r.native} />, <Amount key="v" amount={r.value} />] : [r.name, <Amount key="v" amount={r.value} />],
      }))}
    />
  );
}

function ByAccount({ nw }: { nw: NetWorthResponse }) {
  if (nw.accounts.length === 0) return <p className="text-sm text-muted-foreground">No accounts yet.</p>;
  return (
    <table className="w-full text-sm">
      <thead className="text-xs text-muted-foreground">
        <tr className="border-b">
          <th className="px-2 py-1.5 text-left font-medium">Account</th>
          <th className="px-2 py-1.5 text-right font-medium">Held</th>
          <th className="hidden px-2 py-1.5 text-right font-medium sm:table-cell">Valued by</th>
          <th className="px-2 py-1.5 text-right font-medium">Value</th>
        </tr>
      </thead>
      <tbody className="tabular-nums">
        {nw.accounts.map((a) => (
          <Fragment key={a.accountId}>
            <tr className="border-b bg-muted/30">
              <td className="px-2 py-1.5 font-medium" colSpan={3}>
                <Link href={MONEY_ROUTES.account(a.accountId)} className="hover:underline">
                  {a.institution && a.institution !== a.name ? `${a.institution} · ${a.name}` : a.name}
                </Link>
              </td>
              <td className="px-2 py-1.5 text-right font-medium">
                <Amount amount={a.value} />
              </td>
            </tr>
            {a.items.map((i) => (
              <tr key={`${a.accountId}-${i.code}`} className="border-b last:border-0">
                <td className="px-2 py-1 pl-5 text-muted-foreground">{i.code}</td>
                <td className="px-2 py-1 text-right">{i.kind === "asset" ? <Units units={i.units} /> : <Amount amount={i.native} />}</td>
                <td className="hidden px-2 py-1 text-right text-xs text-muted-foreground sm:table-cell">{VALUED_BY[i.valuedBy] ?? i.valuedBy}</td>
                <td className="px-2 py-1 text-right">
                  <Amount amount={i.value} />
                </td>
              </tr>
            ))}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}
