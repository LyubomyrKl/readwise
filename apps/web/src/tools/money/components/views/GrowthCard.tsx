"use client";

import { useState } from "react";
import { Flag, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { moneyApi } from "../../api";
import { formatAmount, formatDate, formatMonth, isNegative } from "../../lib/format";
import { finishLines, horizon, nextMilestone, num, outlookSeries, type FinishLine } from "../../lib/insights";
import { useMoneyMutation } from "../../queries";
import type { AmountJson, ForecastResponse } from "../../types";
import { Amount } from "../Amount";
import { BandChart } from "../charts/BandChart";
import { TooltipRows } from "../charts/Bars";
import { ChartFrame, DataTable } from "../charts/ChartFrame";
import { Field, Segmented, SimpleSelect } from "../Fields";
import { HowItWorks } from "./HowItWorks";

/** net worth is the first series color on every money screen */
const NET_WORTH = "var(--viz-1)";
const YEARS = [
  { value: "1", label: "1 year" },
  { value: "5", label: "5 years" },
  { value: "10", label: "10 years" },
] as const;
type Years = (typeof YEARS)[number]["value"];
/** the yearly returns offered for investments, percent */
const RETURNS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];

/** "7 months", "2 years", "1 year and 4 months" */
function span(months: number): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const y = years === 1 ? "1 year" : `${years} years`;
  const m = rest === 1 ? "1 month" : `${rest} months`;
  return years === 0 ? m : rest === 0 ? y : `${y} and ${m}`;
}

/** A round amount to read, such as a milestone: no minor units to keep exact. */
const round = (currency: string, value: number): AmountJson => ({ currency, value: String(value), minor: String(value) });

/** The horizon that shows the next finish line, or five years. */
function firstYears(next: FinishLine | undefined): Years {
  if (next?.at) return next.at.months <= 12 ? "1" : next.at.months <= 60 ? "5" : "10";
  return "5";
}

/**
 * Where net worth is heading, and the finish lines on the way: in a sentence how much it grew and
 * the next line the pace crosses; the way ahead over 1, 5 or 10 years with the lines across it;
 * each line's progress, when the pace gets there and how much sooner a tenth less spending would;
 * the return investments are expected to earn. Always from the last twelve months.
 */
export function GrowthCard({ f }: { f: ForecastResponse }) {
  const nw = f.netWorth;
  const lines = finishLines(nw);
  const next = lines.find((l) => !l.reached);
  const [years, setYears] = useState<Years>(() => firstYears(next));
  const shown = horizon(nw, Number(years));
  const o = outlookSeries(shown);
  const last = shown.projection.at(-1);
  const now = num(nw.history.at(-1)?.total);
  // with no finish line yet, the next round figure, offered as the first
  const suggestion = lines.length === 0 && now !== null ? nextMilestone(now, nw.projection.map((p) => ({ date: p.date, value: num(p.value) ?? 0 }))) : null;
  const references = [
    ...lines.filter((l) => !l.reached).map((l) => ({ value: num(l.target) ?? 0, label: `${l.name ?? formatAmount(l.target)}${l.at ? ` · ${formatMonth(l.at.date.slice(0, 7))}` : ""}` })),
    ...(suggestion && suggestion.target > 0 ? [{ value: suggestion.target, label: `${formatAmount(round(f.base, suggestion.target))}?` }] : []),
  ];

  return (
    <Card id="growth" className="scroll-mt-20">
      <CardHeader>
        <CardTitle>Where you are heading</CardTitle>
        <CardDescription>
          <Story f={f} next={next} suggestion={suggestion} />
        </CardDescription>
        <CardAction>
          <HowItWorks>
            <p>
              Today&apos;s net worth, the rest of this month as projected, then the average month you saved over your last 12 (income less
              spending) for every month ahead, and what you have invested growing at the rate you choose. Past moves of markets and
              exchange rates are not carried forward; one-offs (something sold, an account added) count once, in today&apos;s net worth.
            </p>
            <p>
              The shaded range is how much a month&apos;s saving varies, and how unsure the average itself is: it widens the further it
              looks.
            </p>
            <p>
              A finish line is a net worth you want to reach; it is crossed when the way ahead gets there. &ldquo;A tenth less
              spending&rdquo; adds a tenth of your average month of spending to what you save, every month.
            </p>
          </HowItWorks>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-6">
        {last ? (
          // the horizon on a row of its own, so a longer figure never moves it
          <div className="space-y-3">
            <Segmented value={years} onChange={setYears} options={YEARS.map((y) => ({ value: y.value, label: y.label }))} />
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-sm text-muted-foreground">In {YEARS.find((y) => y.value === years)!.label}, {formatDate(last.date)}</span>
              <span className="text-2xl font-semibold tabular-nums">about {formatAmount(last.value)}</span>
              {last.low.value !== last.high.value ? (
                <span className="text-xs text-muted-foreground">
                  likely {formatAmount(last.low)} to {formatAmount(last.high)}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}

        <ChartFrame
          title="Net worth by month end"
          description="Solid: what it was. Dashed: ahead; shaded: the likely range. Dotted: your finish lines."
          table={
            <DataTable
              head={["Month end", "Net worth", "Likely from", "Likely to"]}
              rows={[
                ...shown.history.map((p) => ({ key: p.date, cells: [formatDate(p.date), formatAmount(p.total), "—", "—"] })),
                ...shown.projection.map((p) => ({
                  key: p.date,
                  cells: [formatDate(p.date), `about ${formatAmount(p.value)}`, formatAmount(p.low), formatAmount(p.high)],
                })),
              ]}
            />
          }
        >
          <BandChart
            label="Net worth by month end, behind and ahead, with the finish lines"
            labels={o.labels}
            series={[
              { key: "behind", color: NET_WORTH, values: o.history },
              { key: "ahead", color: NET_WORTH, values: o.projection, dashed: true, endLabel: last ? "Ahead" : undefined },
            ]}
            band={{ low: o.low, high: o.high, color: NET_WORTH }}
            marker={o.history.length > 0 && shown.projection.length > 0 ? { index: o.today, label: "Today" } : undefined}
            references={references}
            tooltip={(i) => {
              const behind = shown.history[i];
              const ahead = shown.projection[i - shown.history.length];
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

        <FinishLines f={f} lines={lines} suggestion={suggestion?.target ?? null} />
        {last ? <ExpectedReturn f={f} /> : null}
      </CardContent>
    </Card>
  );
}

/** The way ahead in a sentence: how much net worth grew, and the next finish line the pace crosses. */
function Story({ f, next, suggestion }: { f: ForecastResponse; next: FinishLine | undefined; suggestion: { target: number; date: string | null } | null }) {
  const { grown, monthlySaving } = f.netWorth;
  if (!monthlySaving) return <>Three months of history tell what you save in a month; until then only the months behind.</>;
  const growth = grown ? (
    <>
      {isNegative(grown.change.value) ? "Down " : "Up "}
      <Amount amount={grown.change} signed muted />
      {` since ${formatMonth(grown.since.slice(0, 7))}. `}
    </>
  ) : null;
  const target = next ? formatAmount(next.target) : suggestion ? formatAmount(round(f.base, suggestion.target)) : null;
  const when = next ? (next.at ? next.at.date : null) : (suggestion?.date ?? null);
  return (
    <>
      {growth}
      {target
        ? when
          ? `At this pace you cross ${target} around ${formatMonth(when.slice(0, 7))}.`
          : `${target} is more than ten years away at this pace.`
        : "Every finish line you set is reached."}
    </>
  );
}

/** The finish lines: each one's progress, when the pace gets there and how much sooner; a form to set another. */
function FinishLines({ f, lines, suggestion }: { f: ForecastResponse; lines: FinishLine[]; suggestion: number | null }) {
  const remove = useMoneyMutation(moneyApi.goals.remove, { success: "Finish line removed" });
  const lever = f.netWorth.lever;
  return (
    <section className="space-y-3" aria-labelledby="finish-lines">
      <h3 id="finish-lines" className="flex items-center gap-2 text-sm font-medium">
        <Flag className="h-4 w-4" style={{ color: NET_WORTH }} aria-hidden /> Finish lines
      </h3>
      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">Set a net worth you want to reach: you will see when your pace gets you there, and how to get there sooner.</p>
      ) : (
        <ul className="space-y-4">
          {lines.map((l) => (
            <li key={l.id} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-baseline gap-2 text-sm">
                  <span className="truncate font-medium">{l.name ?? formatAmount(l.target)}</span>
                  {l.name ? <span className="whitespace-nowrap tabular-nums text-muted-foreground">{formatAmount(l.target)}</span> : null}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  aria-label={`Remove the finish line ${l.name ?? formatAmount(l.target)}`}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(l.id)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                <div className="h-full rounded-full" style={{ width: `${Math.round(l.progress * 100)}%`, background: NET_WORTH }} />
              </div>
              <p className="text-xs text-muted-foreground">
                {l.reached
                  ? "Reached: time for the next one."
                  : `${Math.round(l.progress * 100)}% of the way · ${
                      l.at ? `around ${formatMonth(l.at.date.slice(0, 7))}, in ${span(l.at.months)}` : "more than ten years away at this pace"
                    }${
                      l.sooner && lever
                        ? ` · spending a tenth less (${formatAmount(lever)} a month): ${formatMonth(l.sooner.date.slice(0, 7))}${
                            l.sooner.months ? `, ${span(l.sooner.months)} sooner` : ""
                          }`
                        : ""
                    }`}
              </p>
            </li>
          ))}
        </ul>
      )}
      <AddFinishLine base={f.base} suggestion={suggestion} />
    </section>
  );
}

/** Set a finish line in the base currency; the first can be the next round figure, one click away. */
function AddFinishLine({ base, suggestion }: { base: string; suggestion: number | null }) {
  const [target, setTarget] = useState("");
  const [name, setName] = useState("");
  const add = useMoneyMutation(moneyApi.goals.create, {
    success: "Finish line set",
    onSuccess: () => {
      setTarget("");
      setName("");
    },
  });
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (target.trim()) add.mutate({ target: target.trim(), currency: base, ...(name.trim() ? { name: name.trim() } : {}) });
      }}
    >
      <Field label={`Net worth to reach, ${base}`} className="w-52">
        <Input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder={suggestion ? String(suggestion) : "300000"} />
      </Field>
      <Field label="Name (optional)" className="w-44">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Flat deposit" maxLength={60} />
      </Field>
      <Button type="submit" size="sm" className="h-9" disabled={!target.trim() || add.isPending}>
        <Plus className="mr-1 h-4 w-4" /> Set
      </Button>
      {suggestion ? (
        <Button type="button" variant="outline" size="sm" className="h-9" disabled={add.isPending} onClick={() => add.mutate({ target: String(suggestion), currency: base })}>
          <Flag className="mr-1 h-4 w-4" /> Aim for {formatAmount(round(base, suggestion))}
        </Button>
      ) : null}
    </form>
  );
}

/** The yearly return investments are expected to earn: a setting, chosen where it shows. */
function ExpectedReturn({ f }: { f: ForecastResponse }) {
  const save = useMoneyMutation(moneyApi.settings.update, { success: (s) => `Investments now grow at ${s.expectedReturn}% a year` });
  const current = f.netWorth.expectedReturn;
  const values = RETURNS.includes(current) ? RETURNS : [...RETURNS, current].sort((a, b) => Number(a) - Number(b));
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t pt-4 text-sm text-muted-foreground">
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
