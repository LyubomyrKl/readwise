"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { CalendarClock, LifeBuoy, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Amount } from "../components/Amount";
import { BandChart } from "../components/charts/BandChart";
import { TooltipRows } from "../components/charts/Bars";
import { ChartFrame, DataTable } from "../components/charts/ChartFrame";
import { EmptyState, MoneyPage, PageHeader } from "../components/PageHeader";
import { useQueryParam } from "../components/useQueryParam";
import { BasePicker } from "../components/views/BasePicker";
import { Change } from "../components/views/Change";
import { MissingRates } from "../components/views/NetWorthView";
import { formatAmount, formatDate, formatMonth, isZero } from "../lib/format";
import { categoryBar, categoryScale, outlookSeries, paceSeries } from "../lib/insights";
import { suggestBases } from "../lib/views";
import { useForecast, useMoneySettings } from "../queries";
import { MONEY_ROUTES } from "../routes";
import type { ForecastResponse, PaceFigure } from "../types";

/** Spending is the expenses series everywhere (Reports' monthly flow); net worth the first color. */
const SPENDING = "var(--viz-2)";
const NET_WORTH = "var(--viz-1)";
/** the usual month: a reference, in ink rather than a series color */
const USUAL = "var(--muted-foreground)";

/**
 * Where the money is heading: this month on pace against the months before (each category too),
 * the year so far and as projected, net worth ahead at last year's pace, the months of usual
 * spending the bank covers, and what is still scheduled. Every projection leans on the person's
 * own months; with too few of them, on the pace so far.
 */
export default function InsightsPage() {
  const [base, setBase] = useQueryParam<string>("base", "");
  const { data: settings } = useMoneySettings();
  const { data: f, isLoading, isFetching } = useForecast(base || undefined);
  const shownBase = base || f?.base || settings?.baseCurrency || "";

  return (
    <MoneyPage>
      <PageHeader
        icon={TrendingUp}
        title="Insights"
        description="Where the money is heading: this month on pace, the year, net worth ahead. Each projection leans on your own months before it."
      />
      <BasePicker value={shownBase} onChange={(c) => setBase(c === settings?.baseCurrency ? "" : c)} suggestions={suggestBases(settings?.baseCurrency, [])} />

      {isLoading || !f ? (
        <Skeleton className="h-96" />
      ) : f.basisMonths === 0 && isZero(f.expenses.soFar.value) && isZero(f.income.soFar.value) ? (
        <EmptyState title="Nothing to look ahead from yet">Record or import a few movements: projections start from your own months.</EmptyState>
      ) : (
        <div className={cn("space-y-6 transition-opacity", isFetching && "opacity-70")}>
          <MissingRates currencies={f.missingRates} base={f.base} />
          {f.method === "pace" ? (
            <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              Under three months of history so far: this month is projected in a straight line from its pace, and the year from this
              month. With more months, projections lean on what usually happens.
            </p>
          ) : null}
          <ThisMonth f={f} />
          <Categories f={f} />
          <div className="grid gap-6 lg:grid-cols-2">
            <Year f={f} />
            <SafetyNet f={f} />
          </div>
          <NetWorthAhead f={f} />
          {f.upcoming.length > 0 ? <Upcoming f={f} /> : null}
        </div>
      )}
    </MoneyPage>
  );
}

function Figure({ title, figure, kind, note }: { title: string; figure: PaceFigure; kind: "expense" | "income"; note?: ReactNode }) {
  return (
    <div className="space-y-1.5 rounded-lg border p-4">
      <div className="text-sm text-muted-foreground">{title}</div>
      <div className="text-2xl font-semibold tabular-nums">{formatAmount(figure.projected)}</div>
      <div className="flex flex-wrap items-center gap-2">
        <Change change={figure.change} kind={kind} />
        {figure.typicalMonth ? <span className="text-xs text-muted-foreground">usually {formatAmount(figure.typicalMonth)}</span> : null}
      </div>
      <div className="text-xs text-muted-foreground">
        So far {formatAmount(figure.soFar)}
        {figure.low.value !== figure.high.value ? (
          <>
            {" "}
            · likely {formatAmount(figure.low)} to {formatAmount(figure.high)}
          </>
        ) : null}
        {note}
      </div>
    </div>
  );
}

function ThisMonth({ f }: { f: ForecastResponse }) {
  const s = paceSeries(f.days);
  const history = f.method === "history";
  return (
    <Card>
      <CardHeader>
        <CardTitle>{formatMonth(f.month)} on pace</CardTitle>
        <CardDescription>
          Day {f.day} of {f.daysInMonth}.{" "}
          {history
            ? `Projected as spent so far plus what usually follows after the ${ordinal(f.day)} in your last ${f.basisMonths} months.`
            : "Projected in a straight line from the pace so far."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 md:grid-cols-3">
          <Figure
            title="Spending this month"
            figure={f.expenses}
            kind="expense"
            note={f.expenses.typicalByNow ? <> · by the {ordinal(f.day)} you usually had spent {formatAmount(f.expenses.typicalByNow)}</> : null}
          />
          <Figure title="Income this month" figure={f.income} kind="income" />
          <div className="space-y-1.5 rounded-lg border p-4">
            <div className="text-sm text-muted-foreground">Left over</div>
            <div className="text-2xl font-semibold tabular-nums">
              <Amount amount={f.savings} />
            </div>
            <div className="text-xs text-muted-foreground">
              {f.savingsRate !== null ? `${f.savingsRate}% of the income, if the month ends as projected` : "No income projected this month"}
            </div>
          </div>
        </div>

        <ChartFrame
          title="Spending, day by day"
          description={
            history
              ? `The running total this month against your usual month: the median of the last ${f.basisMonths} months, shaded across their middle half.`
              : "The running total this month."
          }
          legend={[
            { name: "This month", color: SPENDING },
            { name: "Usual month", color: USUAL },
          ]}
          table={
            <DataTable
              head={["Day", "This month", "Usual", "Usual range"]}
              rows={f.days.map((d) => ({
                key: String(d.day),
                cells: [
                  d.day,
                  d.actual ? formatAmount(d.actual) : "—",
                  d.typical ? formatAmount(d.typical) : "—",
                  d.low && d.high ? `${formatAmount(d.low)} – ${formatAmount(d.high)}` : "—",
                ],
              }))}
            />
          }
        >
          <BandChart
            label={`Spending in ${formatMonth(f.month)} by day, against the usual month`}
            labels={s.labels}
            series={[
              { key: "usual", color: USUAL, values: s.typical, dashed: true, endLabel: history ? "Usual" : undefined },
              { key: "month", color: SPENDING, values: s.actual, endLabel: "This month" },
            ]}
            band={history ? { low: s.low, high: s.high, color: USUAL } : undefined}
            marker={{ index: f.day - 1, label: "Today" }}
            tooltip={(i) => {
              const d = f.days[i];
              return (
                <TooltipRows
                  title={`Day ${d.day}`}
                  rows={[
                    { label: "This month", value: d.actual ? formatAmount(d.actual) : "—", color: SPENDING, strong: true },
                    { label: "Usual", value: d.typical ? formatAmount(d.typical) : "—", color: USUAL },
                    ...(d.low && d.high ? [{ label: "Usual range", value: `${formatAmount(d.low)} – ${formatAmount(d.high)}` }] : []),
                  ]}
                />
              );
            }}
          />
        </ChartFrame>
      </CardContent>
    </Card>
  );
}

function Categories({ f }: { f: ForecastResponse }) {
  const [all, setAll] = useState(false);
  if (f.categories.length === 0) return null;
  const shown = all ? f.categories : f.categories.slice(0, 8);
  const max = categoryScale(f.categories);
  const span = `from=${f.month}-01&to=${f.asOf}`;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Categories this month</CardTitle>
        <CardDescription>
          Each as projected, the furthest from its usual month first. In the bar: spent so far, then still expected; the tick is a usual
          month.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        <ul className="divide-y">
          {shown.map((c) => {
            const bar = categoryBar(c, max);
            return (
              <li key={c.categoryId ?? "none"} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,14rem)_1fr_auto] sm:items-center sm:gap-4">
                <div className="min-w-0">
                  <Link
                    href={`${MONEY_ROUTES.transactions}?${c.categoryId ? `category=${c.categoryId}&` : ""}${span}`}
                    className="block truncate text-sm font-medium hover:underline"
                  >
                    {c.name}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    so far {formatAmount(c.soFar)}
                    {c.typicalMonth ? ` · usually ${formatAmount(c.typicalMonth)}` : ""}
                  </div>
                </div>
                <div className="relative h-2.5 rounded-full bg-muted" aria-hidden>
                  <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${bar.projected}%`, background: SPENDING, opacity: 0.35 }} />
                  <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${bar.soFar}%`, background: SPENDING }} />
                  {bar.usual !== null ? <div className="absolute -inset-y-1 w-0.5 rounded bg-foreground" style={{ left: `calc(${bar.usual}% - 1px)` }} /> : null}
                </div>
                <div className="flex items-center justify-between gap-3 sm:justify-end">
                  <span className="text-sm font-medium tabular-nums">{formatAmount(c.projected)}</span>
                  <Change change={c.change} kind="expense" />
                </div>
              </li>
            );
          })}
        </ul>
        {f.categories.length > 8 ? (
          <Button variant="ghost" size="sm" onClick={() => setAll((v) => !v)}>
            {all ? "Show the top 8" : `Show all ${f.categories.length}`}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Year({ f }: { f: ForecastResponse }) {
  const { soFar, projected, lastYear } = f.year;
  const rows: { label: string; pick: (y: typeof soFar) => ReactNode }[] = [
    { label: "Income", pick: (y) => formatAmount(y.income) },
    { label: "Spending", pick: (y) => formatAmount(y.expenses) },
    { label: "Left over", pick: (y) => <Amount amount={y.savings} /> },
    { label: "Of the income", pick: (y) => (y.savingsRate === null ? "—" : `${y.savingsRate}%`) },
  ];
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>{f.year.year} so far and ahead</CardTitle>
        <CardDescription>
          Ahead: so far, the rest of this month as projected, and {f.method === "history" ? "a usual month" : "a month like this one"} for each
          month left.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <DataTable
          head={[
            "",
            "So far",
            `All of ${f.year.year}`,
            ...(lastYear ? [lastYear.months < 12 ? `${f.year.year - 1} (${lastYear.months} months)` : String(f.year.year - 1)] : []),
          ]}
          rows={rows.map((r) => ({
            key: r.label,
            cells: [r.label, r.pick(soFar), <strong key="p">{r.pick(projected)}</strong>, ...(lastYear ? [r.pick(lastYear)] : [])],
          }))}
        />
      </CardContent>
    </Card>
  );
}

function SafetyNet({ f }: { f: ForecastResponse }) {
  const { liquid, monthlyExpenses, months } = f.runway;
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LifeBuoy className="h-4 w-4" /> Safety net
        </CardTitle>
        <CardDescription>How long bank and cash would last at your usual spending, with no income.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="text-3xl font-semibold tabular-nums">{months === null ? "—" : `${months} months`}</div>
        <p className="text-sm text-muted-foreground">
          {monthlyExpenses ? (
            <>
              {formatAmount(liquid)} in bank and cash, against {formatAmount(monthlyExpenses)} spent in a usual month.
            </>
          ) : (
            "Three months of history tell what a usual month costs."
          )}
        </p>
      </CardContent>
    </Card>
  );
}

function NetWorthAhead({ f }: { f: ForecastResponse }) {
  const o = outlookSeries(f.netWorth);
  const last = f.netWorth.projection.at(-1);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Net worth ahead</CardTitle>
        <CardDescription>
          {f.netWorth.monthlyChange ? (
            <>
              At the last year&apos;s pace, <Amount amount={f.netWorth.monthlyChange} signed /> a month (market moves and one-offs
              included).
            </>
          ) : (
            "Four month ends show a pace; until then only the months behind."
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {last ? (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-sm text-muted-foreground">In 12 months, {formatDate(last.date)}</span>
            <span className="text-2xl font-semibold tabular-nums">about {formatAmount(last.value)}</span>
            {last.low.value !== last.high.value ? (
              <span className="text-xs text-muted-foreground">
                likely {formatAmount(last.low)} to {formatAmount(last.high)}
              </span>
            ) : null}
          </div>
        ) : null}
        <ChartFrame
          title="Net worth by month end"
          description="Solid: what it was. Dashed: at the last year's pace, shaded by how much a month usually varies, adding up."
          table={
            <DataTable
              head={["Month end", "Net worth", "Likely from", "Likely to"]}
              rows={[
                ...f.netWorth.history.map((p) => ({ key: p.date, cells: [formatDate(p.date), formatAmount(p.total), "—", "—"] })),
                ...f.netWorth.projection.map((p) => ({
                  key: p.date,
                  cells: [formatDate(p.date), `about ${formatAmount(p.value)}`, formatAmount(p.low), formatAmount(p.high)],
                })),
              ]}
            />
          }
        >
          <BandChart
            label="Net worth by month end, behind and ahead"
            labels={o.labels}
            series={[
              { key: "behind", color: NET_WORTH, values: o.history },
              { key: "ahead", color: NET_WORTH, values: o.projection, dashed: true, endLabel: last ? "At this pace" : undefined },
            ]}
            band={{ low: o.low, high: o.high, color: NET_WORTH }}
            marker={o.history.length > 0 && f.netWorth.projection.length > 0 ? { index: o.today, label: "Today" } : undefined}
            tooltip={(i) => {
              const behind = f.netWorth.history[i];
              const ahead = f.netWorth.projection[i - f.netWorth.history.length];
              return behind ? (
                <TooltipRows title={formatDate(behind.date)} rows={[{ label: "Net worth", value: formatAmount(behind.total), color: NET_WORTH, strong: true }]} />
              ) : ahead ? (
                <TooltipRows
                  title={formatDate(ahead.date)}
                  rows={[
                    { label: "At this pace", value: formatAmount(ahead.value), color: NET_WORTH, strong: true },
                    { label: "Likely", value: `${formatAmount(ahead.low)} – ${formatAmount(ahead.high)}` },
                  ]}
                />
              ) : null;
            }}
          />
        </ChartFrame>
      </CardContent>
    </Card>
  );
}

function Upcoming({ f }: { f: ForecastResponse }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4" /> Still scheduled this month
        </CardTitle>
        <CardDescription>Your recurring movements due after today. The projection above already expects what usually comes.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y text-sm">
          {f.upcoming.map((u) => (
            <li key={`${u.date}-${u.name}`} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block truncate font-medium">{u.name}</span>
                <span className="text-xs text-muted-foreground">
                  {formatDate(u.date)} · {u.kind.replace("_", " ")}
                </span>
              </span>
              <span className="shrink-0 tabular-nums">{u.amount ? formatAmount(u.amount) : "—"}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** 1 -> "1st", 22 -> "22nd" */
function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}
