import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const clamp = (v: number) => Math.min(100, Math.max(0, v));

export interface BarListItem {
  key: string;
  name: ReactNode;
  /** for the bar length only */
  value: number;
  /** the exact amount, formatted */
  display: ReactNode;
  share?: string | null;
  href?: string;
}

/** Ranked parts of one total (expenses by category): name and amount in ink, a thin bar in the series color. */
export function BarList({ items, color, className }: { items: BarListItem[]; color: string; className?: string }) {
  const top = Math.max(0, ...items.map((i) => Math.abs(i.value)));
  return (
    <ul className={cn("space-y-2.5", className)}>
      {items.map((i) => {
        const width = top > 0 ? (Math.abs(i.value) / top) * 100 : 0;
        const body = (
          <>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">{i.name}</span>
              <span className="shrink-0 tabular-nums">
                {i.display}
                {i.share ? <span className="ml-1.5 text-xs text-muted-foreground">{i.share}%</span> : null}
              </span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-muted">
              <div className="h-full rounded-full" style={{ width: `${width > 0 ? Math.max(width, 1) : 0}%`, background: color }} />
            </div>
          </>
        );
        return (
          <li key={i.key}>
            {i.href ? (
              <Link href={i.href} className="block rounded-sm hover:bg-muted/40">
                {body}
              </Link>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Actual share as a bar on a 0-100% track, the target as an ink tick across it. */
export function TargetMeter({ percent, target, color, label }: { percent: number; target: number | null; color: string; label: string }) {
  return (
    <div className="relative h-2 rounded-full bg-muted" role="img" aria-label={label}>
      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${clamp(percent)}%`, background: color }} />
      {target !== null ? (
        <div className="absolute -bottom-1 -top-1 w-0.5 rounded-full bg-foreground" style={{ left: `calc(${clamp(target)}% - 1px)` }} />
      ) : null}
    </div>
  );
}

/** Tooltip body: a heading, then label/value rows with an optional series swatch. */
export function TooltipRows({ title, rows }: { title: ReactNode; rows: { label: ReactNode; value: ReactNode; color?: string; strong?: boolean }[] }) {
  return (
    <div className="space-y-1">
      <div className="font-medium">{title}</div>
      {rows.map((r, i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            {r.color ? <span aria-hidden className="h-2 w-2 rounded-sm" style={{ background: r.color }} /> : null}
            {r.label}
          </span>
          <span className={cn("tabular-nums", r.strong && "font-medium")}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}
