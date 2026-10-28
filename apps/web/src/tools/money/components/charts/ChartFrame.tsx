"use client";

import { useState, type ReactNode } from "react";
import { BarChart3, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface LegendEntry {
  name: string;
  /** a CSS color, e.g. "var(--viz-1)" */
  color: string;
}

/** Series identity: a swatch beside the name; the text stays in ink, never in the series color. */
export function Legend({ entries, className }: { entries: LegendEntry[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground", className)}>
      {entries.map((e) => (
        <li key={e.name} className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: e.color }} />
          {e.name}
        </li>
      ))}
    </ul>
  );
}

/**
 * The container every chart sits in: title, legend (two series or more), and a
 * table view with every value, the accessible twin of the chart.
 */
export function ChartFrame({
  title,
  description,
  legend,
  table,
  dimmed = false,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  legend?: LegendEntry[];
  table: ReactNode;
  /** a new answer is loading: keep the old one, faded */
  dimmed?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <figure className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <figcaption className="text-sm font-medium">{title}</figcaption>
          {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground"
          aria-pressed={asTable}
          onClick={() => setAsTable((v) => !v)}
        >
          {asTable ? <BarChart3 className="mr-1 h-3.5 w-3.5" /> : <Table2 className="mr-1 h-3.5 w-3.5" />}
          {asTable ? "Chart" : "Table"}
        </Button>
      </div>
      {legend && legend.length > 1 && !asTable ? <Legend entries={legend} /> : null}
      <div className={cn("transition-opacity", dimmed && "opacity-60")}>{asTable ? <div className="overflow-x-auto">{table}</div> : children}</div>
    </figure>
  );
}

/** The plain table under a chart's Table toggle. */
export function DataTable({ head, rows }: { head: ReactNode[]; rows: { key: string; cells: ReactNode[] }[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="text-xs text-muted-foreground">
        <tr className="border-b">
          {head.map((h, i) => (
            <th key={i} className={cn("px-2 py-1.5 font-medium", i === 0 ? "text-left" : "text-right")}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="tabular-nums">
        {rows.map((r) => (
          <tr key={r.key} className="border-b last:border-0">
            {r.cells.map((c, i) => (
              <td key={i} className={cn("px-2 py-1.5", i === 0 ? "text-left" : "text-right")}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
