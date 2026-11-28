"use client";

import { useState } from "react";
import { CalendarRange, Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { moneyApi } from "../../api";
import { shiftMonth } from "../../lib/chart";
import { formatMonth, formatMonthShort } from "../../lib/format";
import { initialDraft, pickMonth, RANGE_OPTIONS, rangeTitle, rangeWords, yearMonths, type RangeDraft, type RangeEnd } from "../../lib/insights";
import { useMoneyMutation } from "../../queries";
import type { ForecastRange, ForecastResponse } from "../../types";

/**
 * Learn from: the months this month's pace, the categories, the year and the safety net learn from.
 * One button; its panel has the common ranges (a click applies one) and a custom range the way date
 * pickers do it: a From and a To that say what is being set, one year of months at a time with
 * arrows between years, and Apply. To is "Now" until a last month is picked: new months join.
 */
export function LearnFromPicker({ f }: { f: ForecastResponse }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<RangeDraft>(() => initialDraft(f));
  const [end, setEnd] = useState<RangeEnd>("from");
  const [year, setYear] = useState(() => Number(initialDraft(f).from.slice(0, 4)));
  const [hover, setHover] = useState<string | null>(null);
  const save = useMoneyMutation(moneyApi.settings.update, {
    success: (s) => `Insights now learn from ${rangeWords(s)}`,
    onSuccess: () => setOpen(false),
  });
  const lastMonth = shiftMonth(f.month, -1);
  const firstYear = Number((f.firstMonth ?? f.month).slice(0, 4));
  const thisYear = Number(f.month.slice(0, 4));

  const start = () => {
    const d = initialDraft(f);
    setDraft(d);
    setEnd("from");
    setYear(Number(d.from.slice(0, 4)));
    setHover(null);
  };
  const choose = (range: ForecastRange) => save.mutate({ forecastRange: range });
  const pick = (month: string) => {
    const next = pickMonth(draft, end, month);
    setDraft(next.draft);
    setEnd(next.end);
  };
  // lit: the draft, or while its last month is being picked, up to the month under the pointer
  const upTo = end === "to" && hover !== null && hover >= draft.from ? hover : (draft.to ?? lastMonth);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) start();
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-2 font-normal">
          <CalendarRange className="h-4 w-4 text-muted-foreground" aria-hidden />
          <span className="text-muted-foreground">Learn from</span>
          <span className="font-medium">{rangeTitle(f)}</span>
        </Button>
      </PopoverTrigger>
      {/* never taller than the room there is: on a phone it scrolls */}
      <PopoverContent
        align="end"
        collisionPadding={16}
        className="max-h-(--radix-popover-content-available-height) w-[min(22rem,calc(100vw-2rem))] space-y-4 overflow-y-auto"
      >
        <div className="space-y-1">
          <p className="text-sm font-medium">Learn from</p>
          <p className="text-xs text-muted-foreground">
            {"The months this month's pace, the year and the safety net are worked out from. Something changed, like a tax you now pay? Learn from the months since."}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {RANGE_OPTIONS.filter((o) => o.value !== "custom").map((o) => {
            const on = f.range === o.value;
            return (
              <Button
                key={o.value}
                variant={on ? "secondary" : "ghost"}
                size="sm"
                aria-pressed={on}
                disabled={save.isPending}
                onClick={() => choose(o.value)}
                className="justify-between font-normal"
              >
                {o.label}
                {on ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}
              </Button>
            );
          })}
        </div>

        <div className="space-y-3 border-t pt-3">
          <p className="text-sm font-medium">Custom range</p>
          <div className="grid grid-cols-2 gap-2">
            <EndBox
              label="From"
              value={formatMonthShort(draft.from)}
              active={end === "from"}
              onSelect={() => {
                setEnd("from");
                setYear(Number(draft.from.slice(0, 4)));
              }}
            />
            <EndBox
              label="To"
              value={draft.to ? formatMonthShort(draft.to) : "Now"}
              active={end === "to"}
              onSelect={() => {
                setEnd("to");
                setYear(Number((draft.to ?? lastMonth).slice(0, 4)));
              }}
              onClear={draft.to ? () => setDraft({ ...draft, to: null }) : undefined}
            />
          </div>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {end === "from" ? "Pick the first month." : draft.to ? "Pick the last month." : "Pick the last month, or keep Now: new months join as they pass."}
          </p>

          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="The year before" disabled={year <= firstYear} onClick={() => setYear(year - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium tabular-nums">{year}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="The year after" disabled={year >= thisYear} onClick={() => setYear(year + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-4 gap-1" onPointerLeave={() => setHover(null)}>
            {yearMonths(year, f.month, f.firstMonth).map((m) => {
              // the ends: those set, and while the last is being picked, the month under the pointer
              const endpoint = m.value === draft.from || m.value === draft.to || (end === "to" && m.value === hover && hover >= draft.from);
              const inside = m.value >= draft.from && m.value <= upTo;
              return (
                <button
                  key={m.value}
                  type="button"
                  disabled={m.disabled}
                  aria-label={formatMonth(m.value)}
                  aria-pressed={inside}
                  onClick={() => pick(m.value)}
                  onPointerEnter={() => setHover(m.value)}
                  className={cn(
                    "h-8 rounded-md text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    "disabled:cursor-not-allowed disabled:opacity-30",
                    endpoint ? "bg-primary font-medium text-primary-foreground" : inside ? "bg-primary/15" : "hover:bg-muted"
                  )}
                >
                  {m.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{draft.to ? `${formatMonthShort(draft.from)} – ${formatMonthShort(draft.to)}` : `${formatMonthShort(draft.from)} – now`}</span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" disabled={save.isPending} onClick={() => save.mutate({ forecastRange: "custom", forecastSince: draft.from, forecastUntil: draft.to })}>
                Apply
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** One end of the range: what it is set to, and whether the next month picked sets it. */
function EndBox({ label, value, active, onSelect, onClear }: { label: string; value: string; active: boolean; onSelect: () => void; onClear?: () => void }) {
  return (
    <div className={cn("relative rounded-md border transition-colors", active ? "border-primary ring-2 ring-primary/30" : "hover:bg-muted/50")}>
      <button type="button" onClick={onSelect} aria-pressed={active} aria-label={`${label}: ${value}`} className="w-full rounded-md px-3 py-1.5 text-left">
        <span className="block text-[11px] text-muted-foreground">{label}</span>
        <span className="block text-sm font-medium tabular-nums">{value}</span>
      </button>
      {onClear ? (
        <button
          type="button"
          onClick={onClear}
          aria-label={`${label}: back to now`}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}
