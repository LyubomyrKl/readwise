"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { CalendarClock, CalendarDays, Flag, LifeBuoy, PiggyBank, Sprout, TrendingUp, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { HowItWorks } from "../components/views/HowItWorks";
import { LearnFromPicker } from "../components/views/LearnFromPicker";
import { MissingRates } from "../components/views/NetWorthView";
import { formatAmount, formatDate, formatMonth, isNegative, isZero } from "../lib/format";
import { basisLabel, categoryBar, categoryScale, nextMilestone, num, outlookSeries, paceSeries, safetyLevel, worthSeries } from "../lib/insights";
import { suggestBases } from "../lib/views";
import { useForecast, useMoneyMutation, useMoneySettings } from "../queries";
import { MONEY_ROUTES } from "../routes";
import type { AmountJson, ForecastResponse, PaceFigure } from "../types";

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
/** the safety net is no series: ink */
const SAFETY = "var(--muted-foreground)";
/** the sections the summary leads to sit clear of the page's top bar */
const SECTION = "scroll-mt-20";

/**
 * Where the money is heading: the four answers at a glance, then this month on pace against the
 * months before (each category too), the year so far and as projected, the months of spending the
 * bank covers, net worth ahead (always from the last twelve months) and what moved it, and what is
 * still scheduled. The months learned from are the person's choice (Learn from); how each figure is
 * worked out sits behind its card's note, not under its title.
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
        description="Where your money is heading, worked out from your own months."
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BasePicker value={shownBase} onChange={(c) => setBase(c === settings?.baseCurrency ? "" : c)} suggestions={suggestBases(settings?.baseCurrency, [])} />
        {f ? <LearnFromPicker f={f} /> : null}
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
          <Summary f={f} />
          <ThisMonth f={f} />
          <Categories f={f} />
          {/* the year's table needs the room: three amounts a row */}
          <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Year f={f} />
            <SafetyNet f={f} />
          </div>
          <NetWorthAhead f={f} />
          {f.netWorth.months.length > 0 ? <WorthMonths f={f} /> : null}
          {f.upcoming.length > 0 ? <Upcoming f={f} /> : null}
        </div>
      )}
    </MoneyPage>
  );
}

/** The four answers at a glance, each the way to its section. */
function Summary({ f }: { f: ForecastResponse }) {
  const last = f.netWorth.projection.at(-1);
  const today = f.netWorth.history.at(-1)?.total;
  const rate = f.year.projected.savingsRate;
  const level = safetyLevel(f.runway.months);
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile href="#this-month" icon={CalendarDays} color={SPENDING} label="This month's spending" value={formatAmount(f.expenses.projected)}>
        {f.expenses.change !== null ? <Change change={f.expenses.change} kind="expense" /> : "on pace"}
      </Tile>
      <Tile href="#year" icon={PiggyBank} color={SAVED} label={`Kept in ${f.year.year}`} value={<Amount amount={f.year.projected.savings} />}>
        {rate !== null ? `${rate}% of what you earn` : null}
      </Tile>
      <Tile href="#net-worth" icon={Sprout} color={NET_WORTH} label="Net worth in a year" value={last ? formatAmount(last.value) : "—"}>
        {today ? `from ${formatAmount(today)} today` : null}
      </Tile>
      <Tile href="#safety-net" icon={LifeBuoy} color={SAFETY} label="Safety net" value={f.runway.months === null ? "—" : `${f.runway.months} months`}>
        {level ? `${level === "beyond" ? "more than" : level === "within" ? "within" : "under"} the 3–6 often advised` : "of average spending"}
      </Tile>
    </div>
  );
}

function Tile({ href, icon: Icon, color, label, value, children }: { href: string; icon: LucideIcon; color: string; label: string; value: ReactNode; children?: ReactNode }) {
  return (
    <a
      href={href}
      className="flex min-w-0 flex-col gap-2 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        {/* a tint of the figure's series color: the mark carries identity, the words stay in ink */}
        <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ background: `color-mix(in oklab, ${color} 18%, transparent)`, color }}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        {label}
      </span>
      {/* one line: an amount never breaks inside its digits; smaller on a phone's half width */}
      <span className="whitespace-nowrap text-base font-semibold tabular-nums sm:text-xl">{value}</span>
      {children ? <span className="text-xs text-muted-foreground">{children}</span> : null}
    </a>
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
    <Card id="this-month" className={SECTION}>
      <CardHeader>
        <CardTitle>{formatMonth(f.month)} on pace</CardTitle>
        <CardDescription>{`Day ${f.day} of ${f.daysInMonth}, ${history ? `against ${basisLabel(f)}` : "a straight line from the pace so far"}.`}</CardDescription>
        <CardAction>
          <HowItWorks>
            <p>
              {!history
                ? "Projected in a straight line from the pace so far: there are not yet enough months behind to lean on."
                : f.recordedThrough === 0
                  ? `Nothing recorded this month yet, so it shows as a usual month of ${basisLabel(f)}.`
                  : `As recorded so far, plus what usually followed the ${ordinal(f.recordedThrough)} in ${basisLabel(f)}${
                      f.recordedThrough < f.day ? ` (nothing is recorded after the ${ordinal(f.recordedThrough)} yet)` : ""
                    }. The likely range spans the middle half of those months.`}
            </p>
            <p>One-offs such as selling something you own are left out, as in the month&apos;s totals.</p>
          </HowItWorks>
        </CardAction>
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
              ? "This month's running total against your usual month; shaded, the middle half of your months."
              : "This month's running total."
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
        <CardDescription>Where this month&apos;s spending is heading, the furthest from usual first.</CardDescription>
        <CardAction>
          <HowItWorks>
            <p>Each category the way the month is: spent so far, plus what usually follows, against {basisLabel(f)}.</p>
            <p>
              In each bar: spent so far, then still expected. The tick is a usual month, or the average month for a category that comes
              now and then (a holiday, a yearly bill): its month is not called unusual.
            </p>
          </HowItWorks>
        </CardAction>
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
    <Card id="year" className={cn("min-w-0", SECTION)}>
      <CardHeader>
        <CardTitle>{f.year.year} so far and ahead</CardTitle>
        <CardDescription>What the year adds up to if the months left go the way yours usually do.</CardDescription>
        <CardAction>
          <HowItWorks>
            <p>
              {`Ahead: what is in so far, the rest of this month as projected, and ${
                f.method === "history" ? `an average month of ${basisLabel(f)} (a holiday or a tax included)` : "a month like this one"
              } for each month left.`}
            </p>
          </HowItWorks>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4 overflow-x-auto">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-sm text-muted-foreground">{isNegative(projected.savings.value) ? "Heading to spend more than you earn by" : "On track to keep"}</span>
          <span className="text-2xl font-semibold tabular-nums">
            <Amount amount={projected.savings} muted />
          </span>
          {projected.savingsRate !== null && !isNegative(projected.savings.value) ? (
            <span className="text-sm text-muted-foreground">
              {`${projected.savingsRate}% of what you earn${lastYear?.savingsRate != null ? `, against ${lastYear.savingsRate}% last year` : ""}`}
            </span>
          ) : null}
        </div>
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
    <Card id="safety-net" className={cn("min-w-0", SECTION)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LifeBuoy className="h-4 w-4" /> Safety net
        </CardTitle>
        <CardDescription>How long bank and cash would last at your average spending, with no income.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-3xl font-semibold tabular-nums">{months === null ? "—" : `${months} months`}</div>
        {months !== null ? <SafetyMeter months={months} /> : null}
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

/** The months covered on a scale with the three and six months often advised marked. */
function SafetyMeter({ months }: { months: string }) {
  const m = Number(months);
  const max = Math.max(12, Math.ceil(m));
  const at = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  const level = safetyLevel(months);
  return (
    <div className="space-y-1.5">
      <div className="relative h-2 rounded-full bg-muted" aria-hidden>
        <div className="absolute inset-y-0 left-0 rounded-full bg-foreground/70" style={{ width: at(m) }} />
        {[3, 6].map((v) => (
          <div key={v} className="absolute -inset-y-1 w-0.5 rounded bg-background" style={{ left: `calc(${at(v)} - 1px)` }} />
        ))}
      </div>
      <div className="relative h-3.5 text-[11px] tabular-nums text-muted-foreground" aria-hidden>
        {[3, 6].map((v) => (
          <span key={v} className="absolute -translate-x-1/2" style={{ left: at(v) }}>
            {v}
          </span>
        ))}
        <span className="absolute right-0">{max}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        {level === "beyond"
          ? "More than the 3 to 6 months of spending often advised."
          : level === "within"
            ? "Within the 3 to 6 months of spending often advised."
            : "Under the 3 to 6 months of spending often advised."}
      </p>
    </div>
  );
}

/** A round amount to read, such as a milestone: no minor units to keep exact. */
const round = (currency: string, value: number): AmountJson => ({ currency, value: String(value), minor: String(value) });

/** The next round figure net worth reaches at this pace, and about when. */
function Milestone({ f }: { f: ForecastResponse }) {
  const now = num(f.netWorth.history.at(-1)?.total);
  const m = now === null ? null : nextMilestone(now, f.netWorth.projection.map((p) => ({ date: p.date, value: num(p.value) ?? 0 })));
  if (!m) return null;
  return (
    <p className="flex items-center gap-2 text-sm">
      <Flag className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <span>
        {m.target === 0 ? "Back above zero" : "Next milestone: "}
        {m.target === 0 ? null : <strong className="tabular-nums">{formatAmount(round(f.base, m.target))}</strong>}
        {m.date ? `, around ${formatMonth(m.date.slice(0, 7))}` : ", more than a year away at this pace"}
      </span>
    </p>
  );
}

function NetWorthAhead({ f }: { f: ForecastResponse }) {
  const nw = f.netWorth;
  const o = outlookSeries(nw);
  const last = nw.projection.at(-1);
  return (
    <Card id="net-worth" className={SECTION}>
      <CardHeader>
        <CardTitle>Net worth ahead</CardTitle>
        <CardDescription>
          {nw.monthlySaving ? (
            <>
              {`From what you save in an average month of your last ${nw.savingMonths} months, `}
              <Amount amount={nw.monthlySaving} signed />
              {", and investments at the rate you choose."}
            </>
          ) : (
            "Three months of history tell what you save in a month; until then only the months behind."
          )}
        </CardDescription>
        <CardAction>
          <HowItWorks>
            <p>
              Today&apos;s net worth, the rest of this month as projected, then the average month saved (income less spending) for every
              month ahead. It always learns from your last 12 months, whatever the rest of the page learns from: a long view.
            </p>
            <p>
              One-offs (something sold, an account added) count once, in today&apos;s net worth, never as a month saved. Past moves of
              markets and exchange rates are not carried forward: investments grow only at the rate you choose.
            </p>
            <p>The shaded range widens by how much a month&apos;s saving usually varies, month by month.</p>
          </HowItWorks>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-6">
        {last ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-sm text-muted-foreground">In 12 months, {formatDate(last.date)}</span>
              <span className="text-2xl font-semibold tabular-nums">about {formatAmount(last.value)}</span>
              {last.low.value !== last.high.value ? (
                <span className="text-xs text-muted-foreground">
                  likely {formatAmount(last.low)} to {formatAmount(last.high)}
                </span>
              ) : null}
            </div>
            <Milestone f={f} />
            <ExpectedReturn f={f} />
          </div>
        ) : null}
        <ChartFrame
          title="Net worth by month end"
          description="Solid: what it was. Dashed: ahead; shaded: the likely range."
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
      </CardContent>
    </Card>
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
  return (
    <Card>
      <CardHeader>
        <CardTitle>What moved your net worth</CardTitle>
        <CardDescription>Month by month: what you saved, what markets and exchange rates did, and one-offs.</CardDescription>
        <CardAction>
          <HowItWorks>
            <p>Saved: income less spending. Markets and exchange rates: what prices and rates did to what you own, and anything not recorded as income or spending.</p>
            <p>One-offs: something sold, or an account added with money you already had. The dot is the month&apos;s net change.</p>
          </HowItWorks>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ChartFrame
          title="Month by month"
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
