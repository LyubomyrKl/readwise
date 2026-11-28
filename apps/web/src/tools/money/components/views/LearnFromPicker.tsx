"use client";

import { useState } from "react";
import { CalendarRange, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { moneyApi } from "../../api";
import { formatMonth } from "../../lib/format";
import { monthGrid, pickedRange, RANGE_OPTIONS, rangeTitle, rangeWords } from "../../lib/insights";
import { useMoneyMutation } from "../../queries";
import type { ForecastRange, ForecastResponse } from "../../types";

/**
 * Learn from: the months this month's pace, the categories, the year and the safety net learn from.
 * One button; its panel has the common ranges, and the months a year a row, where two clicks pick a
 * custom range (the same month twice: that month alone) and the panel can be opened again to pick
 * another. A range ending at last month stays open: new months join it as they pass.
 */
export function LearnFromPicker({ f }: { f: ForecastResponse }) {
  const [open, setOpen] = useState(false);
  /** the first month of a custom range being picked */
  const [start, setStart] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const save = useMoneyMutation(moneyApi.settings.update, {
    success: (s) => `Insights now learn from ${rangeWords(s)}`,
    onSuccess: () => setOpen(false),
  });
  const choose = (range: ForecastRange) => save.mutate({ forecastRange: range });
  const pick = (month: string) => {
    if (!start) {
      setStart(month);
      return;
    }
    const range = pickedRange(start, month, f.month);
    setStart(null);
    save.mutate({ forecastRange: "custom", forecastSince: range.since, forecastUntil: range.until });
  };
  // lit: the range being picked (its first month to the one under the pointer), else the months learned from
  const [from, to] = start ? [start, hover ?? start].sort() : [f.basisFrom, f.basisTo];
  const lit = (month: string) => from !== null && to !== null && month >= from && month <= to;
  const end = (month: string) => month === from || month === to;
  /** in the range chosen now (pressed), apart from what a pick in progress lights up */
  const chosen = (month: string) => (start ? month === start : f.basisFrom !== null && f.basisTo !== null && month >= f.basisFrom && month <= f.basisTo);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setStart(null);
        setHover(null);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-2 font-normal">
          <CalendarRange className="h-4 w-4 text-muted-foreground" aria-hidden />
          <span className="text-muted-foreground">Learn from</span>
          <span className="font-medium">{rangeTitle(f)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" collisionPadding={16} className="w-[min(22rem,calc(100vw-2rem))] space-y-4">
        <div className="space-y-1">
          <p className="text-sm font-medium">Learn from</p>
          <p className="text-xs text-muted-foreground">
            {"The months this month's pace, the year and the safety net are worked out from. Something changed, like a tax you now pay? Pick the months since."}
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
        <div className="space-y-2 border-t pt-3">
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {start ? `From ${formatMonth(start)}. Now the last month, or the same one again for it alone.` : "Or pick months: the first, then the last."}
          </p>
          {/* this year first; earlier years scroll, so the panel fits a phone */}
          <div className="max-h-56 space-y-2 overflow-y-auto pr-1" onPointerLeave={() => setHover(null)}>
            {monthGrid(f.month, f.firstMonth).map((y) => (
              <div key={y.year} className="grid grid-cols-[2.75rem_1fr] items-start gap-2">
                <span className="pt-1.5 text-xs tabular-nums text-muted-foreground">{y.year}</span>
                <div className="grid grid-cols-6 gap-1">
                  {y.months.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      disabled={m.disabled || save.isPending}
                      aria-label={formatMonth(m.value)}
                      aria-pressed={chosen(m.value)}
                      onClick={() => pick(m.value)}
                      onPointerEnter={() => setHover(m.value)}
                      onFocus={() => setHover(m.value)}
                      className={cn(
                        "h-7 rounded-md text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                        "disabled:cursor-not-allowed disabled:opacity-35",
                        end(m.value)
                          ? "bg-primary font-medium text-primary-foreground"
                          : lit(m.value)
                            ? "bg-primary/15 text-foreground"
                            : "text-foreground hover:bg-muted"
                      )}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
