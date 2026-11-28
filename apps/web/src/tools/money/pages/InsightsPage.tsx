"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { CalendarClock, LifeBuoy, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { moneyApi } from "../api";
import { Amount } from "../components/Amount";
import { BandChart } from "../components/charts/BandChart";
import { TooltipRows } from "../components/charts/Bars";
import { ChartFrame, DataTable } from "../components/charts/ChartFrame";
import { StackedBars } from "../components/charts/StackedBars";
import { SimpleSelect } from "../components/Fields";
import { EmptyState, MoneyPage, PageHeader } from "../components/PageHeader";
import { useQueryParam } from "../components/useQueryParam";
import { BasePicker } from "../components/views/BasePicker";
import { Change } from "../components/views/Change";
import { MissingRates } from "../components/views/NetWorthView";
import { formatAmount, formatDate, formatMonth, formatMonthSpan, isZero } from "../lib/format";
import { basisLabel, categoryBar, categoryScale, outlookSeries, paceSeries, RANGE_OPTIONS, rangeMonths, rangeWords, worthSeries } from "../lib/insights";
import { suggestBases } from "../lib/views";
import { useForecast, useMoneyMutation, useMoneySettings } from "../queries";
import { MONEY_ROUTES } from "../routes";
import type { ForecastResponse, PaceFigure } from "../types";

/** Spending is the expenses series everywhere (Reports' monthly flow); net worth the first color. */
const SPENDING = "var(--viz-2)";
const NET_WORTH = "var(--viz-1)";
/** the usual month: a reference, in ink rather than a series color */
const USUAL = "var(--muted-foreground)";
/** what moved net worth: saved keeps the Overview's savings color, the other two the next free slots */
const SAVED = "var(--viz-7)";
const MARKETS = "var(--viz-4)";
const ONE_OFFS = "var(--viz-5)";
/** a month's net change: a marker in ink */
const NET = "var(--foreground)";
/** the yearly returns offered for investments, percent */
const RETURNS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];

/**
 * Where the money is heading: this month on pace against the months before (each category too, one
 * that comes in lumps said so), the year so far and as projected, net worth ahead from what an
 * average month saves and where each month's change came from, the months of average spending the
 * bank covers, and what is still scheduled. Every projection leans on the person's own months; with
 * too few of them, on the pace so far.
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
        description="Where the money is heading: this month on pace, the year, net worth ahead. Each projection leans on your own months before it; if something changed (a tax you now pay, a new job), learn only from the months since."
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BasePicker value={shownBase} onChange={(c) => setBase(c === settings?.baseCurrency ? "" : c)} suggestions={suggestBases(settings?.baseCurrency, [])} />
        {f ? <LearnFrom f={f} /> : null}
      </div>

      {isLoading || !f ? (
        <Skeleton className="h-96" />
      ) : f.basisMonths === 0 && isZero(f.expenses.soFar.value) && isZero(f.income.soFar.value) ? (
        f.range !== "last_12_months" ? (
          <EmptyState title="Nothing in the months you chose to look ahead from yet">
            Choose other months to learn from, or record this month&apos;s movements.
          </EmptyState>
        ) : (
          <EmptyState title="Nothing to look ahead from yet">Record or import a few movements: projections start from your own months.</EmptyState>
        )
      ) : (
        <div className={cn("space-y-6 transition-opacity", isFetching && "opacity-70")}>
          <MissingRates currencies={f.missingRates} base={f.base} />
          {f.method === "pace" ? (
            <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              {f.range !== "last_12_months"
                ? "No full month in the months you chose to learn from yet: this month is projected in a straight line from its pace, and the year from this month."
                : "Under three months of history so far: this month is projected in a straight line from its pace, and the year from this month. With more months, projections lean on what usually happens."}
            </p>
          ) : null}
          <ThisMonth f={f} />
          <Categories f={f} />
          {/* the year's table needs the room: three amounts a row */}
          <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
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
          {!history
            ? "Projected in a straight line from the pace so far."
            : f.recordedThrough === 0
              ? `Nothing recorded this month yet, so it shows as a usual month of ${basisLabel(f)}.`
              : `Projected as recorded so far plus what usually follows after the ${ordinal(f.recordedThrough)} in ${basisLabel(f)}${
                  f.recordedThrough < f.day ? ` (nothing recorded after the ${ordinal(f.recordedThrough)} yet)` : ""
                }.`}
          {" "}One-offs such as selling something you own are left out.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 md:grid-cols-3">
          <Figure
            title="Spending this month"
            figure={f.expenses}
            kind="expense"
            note={
              f.expenses.typicalByNow && f.recordedThrough > 0 ? (
                <> · by the {ordinal(f.recordedThrough)} you usually had spent {formatAmount(f.expenses.typicalByNow)}</>
              ) : null
            }
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
              ? `The running total this month against your usual month: the median of ${basisLabel(f)}, shaded across their middle half.`
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
          month, or the average month for one that comes now and then (a holiday, a yearly bill).
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
                    {c.lumpy && c.averageMonth
                      ? ` · in ${c.monthsWith} of ${f.basisMonths} months, ${formatAmount(c.averageMonth)} a month on average`
                      : c.typicalMonth
                        ? ` · usually ${formatAmount(c.typicalMonth)}`
                        : ""}
                  </div>
                </div>
                <div className="relative h-2.5 rounded-full bg-muted" aria-hidden>
                  <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${bar.projected}%`, background: SPENDING, opacity: 0.35 }} />
                  <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${bar.soFar}%`, background: SPENDING }} />
                  {bar.usual !== null ? <div className="absolute -inset-y-1 w-0.5 rounded bg-foreground" style={{ left: `calc(${bar.usual}% - 1px)` }} /> : null}
                </div>
                <div className="flex items-center justify-between gap-3 sm:justify-end">
                  <span className="text-sm font-medium tabular-nums">{formatAmount(c.projected)}</span>
                  {c.lumpy ? (
                    <span className="whitespace-nowrap rounded-full border px-2 py-0.5 text-xs text-muted-foreground">Now and then</span>
                  ) : (
                    <Change change={c.change} kind="expense" />
                  )}
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
          Ahead: so far, the rest of this month as projected, and{" "}
          {f.method === "history" ? "an average month (a holiday or a tax included)" : "a month like this one"} for each month left.
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
        <CardDescription>How long bank and cash would last at your average spending, with no income.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="text-3xl font-semibold tabular-nums">{months === null ? "—" : `${months} months`}</div>
        <p className="text-sm text-muted-foreground">
          {monthlyExpenses ? (
            <>
              {formatAmount(liquid)} in bank and cash, against {formatAmount(monthlyExpenses)} spent in an average month.
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
  const nw = f.netWorth;
  const o = outlookSeries(nw);
  const last = nw.projection.at(-1);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Net worth ahead</CardTitle>
        <CardDescription>
          {nw.monthlySaving ? (
            <>
              From what you save: <Amount amount={nw.monthlySaving} signed />
              {` in an average month of ${basisLabel(f)}, income less spending. One-offs (something sold, an account added) count once, in today's net worth; markets grow only at the rate you choose.`}
            </>
          ) : (
            "Three months of history tell what you save in a month; until then only the months behind."
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {last ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-sm text-muted-foreground">In 12 months, {formatDate(last.date)}</span>
              <span className="text-2xl font-semibold tabular-nums">about {formatAmount(last.value)}</span>
              {last.low.value !== last.high.value ? (
                <span className="text-xs text-muted-foreground">
                  likely {formatAmount(last.low)} to {formatAmount(last.high)}
                </span>
              ) : null}
            </div>
            <ExpectedReturn f={f} />
          </div>
        ) : null}
        <ChartFrame
          title="Net worth by month end"
          description="Solid: what it was. Dashed: today, plus the average month saved and investments at the rate you chose; shaded by how much a month's saving usually varies, adding up."
          table={
            <DataTable
              head={["Month end", "Net worth", "Likely from", "Likely to"]}
              rows={[
                ...nw.history.map((p) => ({ key: p.date, cells: [formatDate(p.date), formatAmount(p.total), "—", "—"] })),
                ...nw.projection.map((p) => ({
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
              { key: "ahead", color: NET_WORTH, values: o.projection, dashed: true, endLabel: last ? "Ahead" : undefined },
            ]}
            band={{ low: o.low, high: o.high, color: NET_WORTH }}
            marker={o.history.length > 0 && nw.projection.length > 0 ? { index: o.today, label: "Today" } : undefined}
            tooltip={(i) => {
              const behind = nw.history[i];
              const ahead = nw.projection[i - nw.history.length];
              return behind ? (
                <TooltipRows title={formatDate(behind.date)} rows={[{ label: "Net worth", value: formatAmount(behind.total), color: NET_WORTH, strong: true }]} />
              ) : ahead ? (
                <TooltipRows
                  title={formatDate(ahead.date)}
                  rows={[
                    { label: "Ahead", value: formatAmount(ahead.value), color: NET_WORTH, strong: true },
                    { label: "Likely", value: `${formatAmount(ahead.low)} – ${formatAmount(ahead.high)}` },
                  ]}
                />
              ) : null;
            }}
          />
        </ChartFrame>
        {nw.months.length > 0 ? <WorthMonths f={f} /> : null}
      </CardContent>
    </Card>
  );
}

/** "to" a custom range's end: now, up to last month */
const NOW = "now";

/**
 * Where every projection learns from: the last month, 3, 6 or 12 months, this year, or a custom
 * range of months (things changed: a tax began). A setting, so the Overview and Claude follow it.
 */
function LearnFrom({ f }: { f: ForecastResponse }) {
  const save = useMoneyMutation(moneyApi.settings.update, { success: (s) => `Insights now learn from ${rangeWords(s)}` });
  const recent = rangeMonths(f.month);
  // a start older than three years stays in the list
  const months = !f.since || recent.some((m) => m.value === f.since) ? recent : [...recent, { value: f.since, label: formatMonth(f.since) }];
  const since = f.since ?? f.basisFrom ?? recent[2].value;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      <label htmlFor="learn-from">Learn from</label>
      <SimpleSelect
        id="learn-from"
        value={f.range}
        onChange={(range) => save.mutate(range === "custom" ? { forecastRange: "custom", forecastSince: since, forecastUntil: f.until } : { forecastRange: range })}
        options={RANGE_OPTIONS}
        className="h-8 w-auto min-w-36"
      />
      {f.range === "custom" && f.since ? (
        <>
          <label htmlFor="learn-from-since">from</label>
          <SimpleSelect
            id="learn-from-since"
            value={f.since}
            onChange={(start) => save.mutate({ forecastRange: "custom", forecastSince: start, forecastUntil: f.until && f.until < start ? null : f.until })}
            options={months}
            className="h-8 w-auto min-w-36"
          />
          <label htmlFor="learn-from-until">to</label>
          <SimpleSelect
            id="learn-from-until"
            value={f.until ?? NOW}
            onChange={(end) => save.mutate({ forecastRange: "custom", forecastUntil: end === NOW ? null : end })}
            options={[{ value: NOW, label: "now" }, ...months.filter((m) => m.value >= f.since!)]}
            className="h-8 w-auto min-w-32"
          />
        </>
      ) : null}
      <span className="text-xs">{f.basisFrom && f.basisTo ? formatMonthSpan(f.basisFrom, f.basisTo) : "no full month yet"}</span>
    </div>
  );
}

/** The yearly return investments are expected to earn: a setting, chosen where it shows. */
function ExpectedReturn({ f }: { f: ForecastResponse }) {
  const save = useMoneyMutation(moneyApi.settings.update, { success: (s) => `Investments now grow at ${s.expectedReturn}% a year` });
  const current = f.netWorth.expectedReturn;
  const values = RETURNS.includes(current) ? RETURNS : [...RETURNS, current].sort((a, b) => Number(a) - Number(b));
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
      <label htmlFor="expected-return">
        Investments, <Amount amount={f.netWorth.invested} /> today, grow at
      </label>
      <SimpleSelect
        id="expected-return"
        value={current}
        onChange={(expectedReturn) => save.mutate({ expectedReturn })}
        options={values.map((v) => ({ value: v, label: `${v}% a year` }))}
        className="h-8 w-32"
      />
    </div>
  );
}

/** Each month's change of net worth, told apart: saved, markets and exchange rates, one-offs and accounts added. */
function WorthMonths({ f }: { f: ForecastResponse }) {
  const months = f.netWorth.months;
  const s = worthSeries(months);
  const title = (month: string) => `${formatMonth(month)}${month === f.month ? ", so far" : ""}`;
  // the full months outside the ones every projection learns from, faded
  const muted = months.map((m) => m.month !== f.month && !(f.basisFrom && f.basisTo && m.month >= f.basisFrom && m.month <= f.basisTo));
  return (
    <ChartFrame
      title="Where each month's change came from"
      description={`Saved: income less spending. Markets and exchange rates: what prices and rates did to what you own (and anything not recorded). One-offs: something sold, or an account added with money you already had. The dot is the month's net change.${
        muted.some(Boolean) ? " Faded: months the projections do not learn from." : ""
      }`}
      legend={[
        { name: "Saved", color: SAVED },
        { name: "Markets and exchange rates", color: MARKETS },
        { name: "One-offs and accounts added", color: ONE_OFFS },
        { name: "Net change", color: NET, shape: "dot" },
      ]}
      table={
        <DataTable
          head={["Month", "Net change", "Saved", "Markets and exchange rates", "One-offs", "Accounts added"]}
          rows={months.map((m) => ({
            key: m.month,
            cells: [
              title(m.month),
              <Amount key="c" amount={m.change} signed />,
              <Amount key="s" amount={m.saved} signed />,
              <Amount key="m" amount={m.markets} signed />,
              <Amount key="o" amount={m.oneOffs} signed />,
              <Amount key="a" amount={m.added} signed />,
            ],
          }))}
        />
      }
    >
      <StackedBars
        label={`Each month's change of net worth in ${f.base}: saved, markets and exchange rates, one-offs`}
        categories={months.map((m, i) => ({ key: m.month, label: s.labels[i] }))}
        series={[
          { key: "saved", color: SAVED, values: s.saved },
          { key: "markets", color: MARKETS, values: s.markets },
          { key: "one-offs", color: ONE_OFFS, values: s.oneOffs },
        ]}
        net={s.net}
        muted={muted}
        tooltip={(i) => {
          const m = months[i];
          return (
            <TooltipRows
              title={title(m.month)}
              rows={[
                { label: "Net change", value: formatAmount(m.change, { signed: true }), strong: true },
                { label: "Saved", value: formatAmount(m.saved, { signed: true }), color: SAVED },
                { label: "Markets and exchange rates", value: formatAmount(m.markets, { signed: true }), color: MARKETS },
                ...(isZero(m.oneOffs.value) ? [] : [{ label: "One-offs", value: formatAmount(m.oneOffs, { signed: true }), color: ONE_OFFS }]),
                ...(isZero(m.added.value) ? [] : [{ label: "Accounts added", value: formatAmount(m.added, { signed: true }), color: ONE_OFFS }]),
              ]}
            />
          );
        }}
      />
    </ChartFrame>
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
