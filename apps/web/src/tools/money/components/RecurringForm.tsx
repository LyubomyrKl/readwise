"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { moneyApi } from "../api";
import { today } from "../lib/format";
import { buildRule, parseRule, WEEKDAYS, type Freq, type ScheduleParts } from "../lib/schedule";
import { useMoneyMutation } from "../queries";
import type { Movement, RecurringKind, RecurringRule } from "../types";
import { DateInput, Field, Segmented, SimpleSelect } from "./Fields";
import { MovementForm, type CashKind } from "./MovementForm";
import { TradeForm, type TradeKind } from "./TradeForm";

const CASH: { value: CashKind; label: string }[] = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer" },
  { value: "fee", label: "Fee" },
];
const TRADES: { value: TradeKind; label: string }[] = [
  { value: "buy", label: "Buy" },
  { value: "sell", label: "Sell" },
  { value: "investment_income", label: "Dividend or interest" },
];
const FREQS: { value: Freq; label: string }[] = [
  { value: "MONTHLY", label: "Monthly" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "YEARLY", label: "Yearly" },
  { value: "DAILY", label: "Daily" },
];
const DAY_OPTIONS = [...Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })), { value: "-1", label: "Last day" }];
const MONTH_OPTIONS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((m, i) => ({
  value: String(i + 1),
  label: m,
}));
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const UNIT: Record<Freq, [string, string]> = { DAILY: ["day", "days"], WEEKLY: ["week", "weeks"], MONTHLY: ["month", "months"], YEARLY: ["year", "years"] };

function defaults(start: string): ScheduleParts {
  const d = new Date(`${start}T00:00:00Z`);
  return { freq: "MONTHLY", interval: 1, byDay: [(d.getUTCDay() + 6) % 7], byMonthDay: d.getUTCDate(), byMonth: d.getUTCMonth() + 1 };
}

/**
 * A recurring movement: when it repeats, and the movement itself (without a
 * date, each run brings its own). Each run is a draft for approval unless it
 * posts on its own.
 */
export function RecurringForm({ rule, onDone }: { rule?: RecurringRule; onDone: () => void }) {
  const [name, setName] = useState(rule?.name ?? "");
  const [start, setStart] = useState(rule?.startDate ?? today());
  const [end, setEnd] = useState(rule?.endDate ?? "");
  const [autoPost, setAutoPost] = useState(rule?.autoPost ?? false);
  const [parts, setParts] = useState<ScheduleParts>(() => {
    const base = defaults(rule?.startDate ?? today());
    if (!rule) return base;
    const parsed = parseRule(rule.schedule);
    return { ...base, ...parsed, byDay: parsed.byDay.length ? parsed.byDay : base.byDay, byMonthDay: parsed.byMonthDay ?? base.byMonthDay, byMonth: parsed.byMonth ?? base.byMonth };
  });
  const [group, setGroup] = useState<"money" | "investments">(rule && TRADES.some((t) => t.value === rule.kind) ? "investments" : "money");
  const set = <K extends keyof ScheduleParts>(key: K, value: ScheduleParts[K]) => setParts((p) => ({ ...p, [key]: value }));

  const save = useMoneyMutation(
    async (movement: Movement) => {
      if (!name.trim()) throw new Error("Give it a name");
      if (parts.freq === "WEEKLY" && parts.byDay.length === 0) throw new Error("Pick at least one weekday");
      const schedule = buildRule(parts);
      const body = { name: name.trim(), template: movement.input, schedule, endDate: end || null, autoPost };
      return rule
        ? moneyApi.recurring.update(rule.id, body)
        : moneyApi.recurring.create({ ...body, kind: movement.kind as RecurringKind, startDate: start });
    },
    { success: rule ? "Saved" : "Recurring movement created", onSuccess: onDone }
  );

  const initial: Movement | undefined = rule ? { kind: rule.kind, input: rule.template } : undefined;
  const [one, many] = UNIT[parts.freq];

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <Field label="Name" htmlFor="rec-name">
          <Input id="rec-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Rent" maxLength={80} />
        </Field>

        <div className="space-y-2">
          <div className="text-sm font-medium">Repeats</div>
          <div className="flex flex-wrap items-center gap-3">
            <Segmented scroll value={parts.freq} onChange={(v) => set("freq", v)} options={FREQS} />
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              every
              <Input
                aria-label="Interval"
                className="h-9 w-16 tabular-nums"
                inputMode="numeric"
                value={String(parts.interval)}
                onChange={(e) => set("interval", Math.max(1, Math.min(366, Number(e.target.value.replace(/\D/g, "")) || 1)))}
              />
              {parts.interval === 1 ? one : many}
            </label>
          </div>
        </div>

        {parts.freq === "WEEKLY" ? (
          <Field label="On">
            <div className="flex flex-wrap gap-1" role="group" aria-label="Weekdays">
              {WEEKDAYS.map((_, d) => {
                const on = parts.byDay.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set("byDay", on ? parts.byDay.filter((x) => x !== d) : [...parts.byDay, d])}
                    className={cn("rounded-md border px-2.5 py-1.5 text-sm", on ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
                  >
                    {WEEKDAY_LABELS[d]}
                  </button>
                );
              })}
            </div>
          </Field>
        ) : null}
        {parts.freq === "MONTHLY" || parts.freq === "YEARLY" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {parts.freq === "YEARLY" ? (
              <Field label="Month">
                <SimpleSelect value={String(parts.byMonth ?? 1)} onChange={(v) => set("byMonth", Number(v))} options={MONTH_OPTIONS} />
              </Field>
            ) : null}
            <Field label="Day" hint="A day past the end of a month falls on its last day">
              <SimpleSelect value={String(parts.byMonthDay ?? 1)} onChange={(v) => set("byMonthDay", Number(v))} options={DAY_OPTIONS} />
            </Field>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Starts" hint={rule ? "Fixed once created" : undefined}>
            {rule ? <Input value={start} disabled /> : <DateInput value={start} onChange={setStart} />}
          </Field>
          <Field label="Ends" hint="Optional">
            <DateInput value={end} onChange={setEnd} />
          </Field>
        </div>

        <Field label="Each time">
          <Segmented
            value={autoPost ? "post" : "draft"}
            onChange={(v) => setAutoPost(v === "post")}
            options={[
              { value: "draft", label: "Propose a draft" },
              { value: "post", label: "Post on the day" },
            ]}
          />
        </Field>
      </div>

      <div className="space-y-3 border-t pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-medium">The movement</div>
          {rule ? null : (
            <Segmented
              value={group}
              onChange={setGroup}
              options={[
                { value: "money", label: "Money" },
                { value: "investments", label: "Investments" },
              ]}
            />
          )}
        </div>
        {group === "money" ? (
          <MovementForm
            key="money"
            template
            initial={initial}
            kinds={CASH}
            lockKind={!!rule}
            submitLabel={rule ? "Save" : "Create"}
            onSubmit={(m) => save.mutateAsync(m)}
          />
        ) : (
          <TradeForm
            key="investments"
            template
            initial={initial}
            kinds={TRADES}
            lockKind={!!rule}
            submitLabel={rule ? "Save" : "Create"}
            onSubmit={(m) => save.mutateAsync(m)}
          />
        )}
      </div>
    </div>
  );
}
