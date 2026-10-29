"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { monthBounds, shortMonth } from "../../lib/chart";
import { formatAmount, formatMonth, formatMonthSpan, percent } from "../../lib/format";
import { RANGE_TITLES, type RangeKey } from "../../lib/views";
import { useMonth, useMonthly, usePeriod } from "../../queries";
import { MONEY_ROUTES } from "../../routes";
import type { CategoryValue, MonthDetail, MonthFlow } from "../../types";
import { Amount } from "../Amount";
import { BarList, TooltipRows } from "../charts/Bars";
import { BarChart } from "../charts/BarChart";
import { ChartFrame, DataTable } from "../charts/ChartFrame";
import { LineChart } from "../charts/LineChart";
import { MissingRates } from "./NetWorthView";

/** Series identity, the same on every money screen. */
export const FLOW_SERIES = [
  { key: "income", name: "Income", color: "var(--viz-1)" },
  { key: "expenses", name: "Expenses", color: "var(--viz-2)" },
  { key: "invested", name: "Invested", color: "var(--viz-3)" },
] as const;
const RATE_COLOR = "var(--viz-7)";

function rate(value: string | null): string {
  return value === null ? "—" : percent(value);
}

function flowRows(m: MonthFlow) {
  return [
    { label: "Income", value: formatAmount(m.income), color: FLOW_SERIES[0].color },
    { label: "Expenses", value: formatAmount(m.expenses), color: FLOW_SERIES[1].color },
    { label: "Invested", value: formatAmount(m.invested), color: FLOW_SERIES[2].color },
    { label: "Saved", value: formatAmount(m.savings) },
    { label: "Savings rate", value: rate(m.savingsRate), color: RATE_COLOR },
  ];
}

/** The figures a detail card shows, for one month or a span of them. */
export type FlowDetail = Omit<MonthDetail, "month">;

export function MonthlyView({
  base,
  from,
  range,
  month,
  onMonth,
}: {
  base?: string;
  from: string;
  range: RangeKey;
  month: string;
  onMonth: (month: string) => void;
}) {
  const monthly = useMonthly(base, from);
  const months = monthly.data?.months ?? [];
  // no month picked: the card shows the whole range
  const selected = month && months.some((m) => m.month === month) ? month : undefined;
  const detail = useMonth(selected, base);
  const period = usePeriod(base, from, undefined, !selected);

  if (monthly.isLoading || !monthly.data) return <Skeleton className="h-96" />;
  const index = months.findIndex((m) => m.month === selected);

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-8">
          <MissingRates currencies={monthly.data.missingRates} base={monthly.data.base} />
          <ChartFrame
            title={`Income, expenses and money invested per month, ${monthly.data.base}`}
            description="Invested is what moved from bank and debt accounts into investments, at cost. Pick a month to see it alone."
            legend={FLOW_SERIES.map((s) => ({ name: s.name, color: s.color }))}
            dimmed={monthly.isPlaceholderData}
            table={
              <DataTable
                head={["Month", "Income", "Expenses", "Invested", "Saved", "Savings rate"]}
                rows={months.map((m) => ({
                  key: m.month,
                  cells: [
                    formatMonth(m.month),
                    <Amount key="i" amount={m.income} />,
                    <Amount key="e" amount={m.expenses} muted />,
                    <Amount key="v" amount={m.invested} />,
                    <Amount key="s" amount={m.savings} />,
                    rate(m.savingsRate),
                  ],
                }))}
              />
            }
          >
            <BarChart
              label={`Income, expenses and money invested per month in ${monthly.data.base}`}
              categories={months.map((m) => ({ key: m.month, label: shortMonth(m.month) }))}
              series={FLOW_SERIES.map((s) => ({ ...s }))}
              values={[months.map((m) => Number(m.income.value)), months.map((m) => Number(m.expenses.value)), months.map((m) => Number(m.invested.value))]}
              selected={index < 0 ? null : index}
              onSelect={(i) => onMonth(months[i].month === selected ? "" : months[i].month)}
              tooltip={(i) => <TooltipRows title={formatMonth(months[i].month)} rows={flowRows(months[i])} />}
            />
          </ChartFrame>

          <ChartFrame
            title="Savings rate"
            description="Share of income not spent; a month without income has none."
            dimmed={monthly.isPlaceholderData}
            table={
              <DataTable
                head={["Month", "Savings rate"]}
                rows={months.map((m) => ({ key: m.month, cells: [formatMonth(m.month), rate(m.savingsRate)] }))}
              />
            }
          >
            <LineChart
              label="Savings rate per month"
              color={RATE_COLOR}
              height={140}
              formatTick={(v) => `${v}%`}
              points={months.map((m) => ({ key: m.month, label: shortMonth(m.month), value: m.savingsRate === null ? null : Number(m.savingsRate) }))}
              tooltip={(i) => (
                <TooltipRows
                  title={formatMonth(months[i].month)}
                  rows={[
                    { label: "Savings rate", value: rate(months[i].savingsRate), color: RATE_COLOR, strong: true },
                    { label: "Saved", value: formatAmount(months[i].savings) },
                  ]}
                />
              )}
            />
          </ChartFrame>
        </CardContent>
      </Card>

      {selected ? (
        <MonthCard
          title={formatMonth(selected)}
          detail={detail.data}
          span={{ from: selected, to: selected }}
          loading={detail.isLoading}
          dimmed={detail.isPlaceholderData}
          action={
            <Button variant="ghost" size="sm" onClick={() => onMonth("")}>
              <X className="mr-1 h-4 w-4" /> Show whole period
            </Button>
          }
        />
      ) : (
        <MonthCard
          title={RANGE_TITLES[range]}
          description={period.data ? formatMonthSpan(period.data.from, period.data.to) : undefined}
          detail={period.data}
          span={period.data}
          loading={period.isLoading}
          dimmed={period.isPlaceholderData}
        />
      )}
    </div>
  );
}

/** One month or a span of months (YYYY-MM to YYYY-MM): the four numbers and where the money went, by category. */
export function MonthCard({
  title,
  description,
  detail,
  span,
  action,
  loading,
  dimmed,
  top,
}: {
  title: ReactNode;
  description?: ReactNode;
  detail?: FlowDetail;
  span?: { from: string; to: string };
  action?: ReactNode;
  loading?: boolean;
  dimmed?: boolean;
  top?: number;
}) {
  if (loading || !detail || !span) return <Skeleton className="h-64" />;
  return (
    <Card className={cn("transition-opacity", dimmed && "opacity-60")}>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle className="text-base">{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {action}
      </CardHeader>
      <CardContent className="space-y-6">
        <MonthFigures month={detail} />
        <MissingRates currencies={detail.missingRates} base={detail.base} />
        <div className="grid gap-6 md:grid-cols-2">
          <CategoryBreakdown title="Expenses by category" items={detail.expensesByCategory} span={span} color={FLOW_SERIES[1].color} top={top} />
          <CategoryBreakdown title="Income by category" items={detail.incomeByCategory} span={span} color={FLOW_SERIES[0].color} top={top} />
        </div>
      </CardContent>
    </Card>
  );
}

/** Income, expenses, invested, savings rate: the figures, each beside its series swatch. */
export function MonthFigures({ month }: { month: Omit<MonthFlow, "month"> }) {
  const figures = [
    { label: "Income", value: formatAmount(month.income), color: FLOW_SERIES[0].color },
    { label: "Expenses", value: formatAmount(month.expenses), color: FLOW_SERIES[1].color },
    { label: "Invested", value: formatAmount(month.invested), color: FLOW_SERIES[2].color },
    { label: "Savings rate", value: rate(month.savingsRate), color: RATE_COLOR, note: `${formatAmount(month.savings)} saved` },
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-4">
      {figures.map((f) => (
        <div key={f.label} className="min-w-0">
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span aria-hidden className="h-2 w-2 rounded-sm" style={{ background: f.color }} />
            {f.label}
          </dt>
          <dd className="break-words text-lg font-semibold tracking-tight sm:text-xl">{f.value}</dd>
          {f.note ? <dd className="text-xs text-muted-foreground">{f.note}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

export function CategoryBreakdown({
  title,
  items,
  span,
  color,
  top,
}: {
  title: string;
  items: CategoryValue[];
  /** the months the items cover, YYYY-MM; the category links open their transactions */
  span: { from: string; to: string };
  color: string;
  top?: number;
}) {
  const from = monthBounds(span.from).from;
  const to = monthBounds(span.to).to;
  const shown = top ? items.slice(0, top) : items;
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-medium">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{span.from === span.to ? "Nothing this month." : "Nothing in this period."}</p>
      ) : (
        <BarList
          color={color}
          items={shown.map((c) => ({
            key: c.categoryId ?? "none",
            name: c.name,
            value: Number(c.value.value),
            display: formatAmount(c.value),
            share: c.percent,
            href: c.categoryId ? `${MONEY_ROUTES.transactions}?category=${c.categoryId}&from=${from}&to=${to}` : undefined,
          }))}
        />
      )}
      {top && items.length > top ? <p className="text-xs text-muted-foreground">and {items.length - top} more</p> : null}
    </section>
  );
}
