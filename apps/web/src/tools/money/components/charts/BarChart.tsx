"use client";

import { useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { barPath, compactNumber, labelEvery, niceScale } from "../../lib/chart";
import { useWidth } from "./useWidth";

export interface BarSeries {
  key: string;
  name: string;
  /** a CSS color, e.g. "var(--viz-1)" */
  color: string;
}

const MARGIN = { top: 12, right: 12, bottom: 24, left: 48 };
const GAP = 2;
const MAX_BAR = 24;

/**
 * Grouped bars per category (a month): thin bars with rounded data ends
 * anchored at zero, 2px apart; one hover target per group with a tooltip, and
 * a click (or Enter) that selects the group.
 */
export function BarChart({
  categories,
  series,
  values,
  label,
  tooltip,
  selected,
  onSelect,
  height = 200,
  formatTick = compactNumber,
}: {
  categories: { key: string; label: string }[];
  series: BarSeries[];
  /** values[series][category] */
  values: number[][];
  label: string;
  tooltip: (index: number) => ReactNode;
  selected?: number | null;
  onSelect?: (index: number) => void;
  height?: number;
  formatTick?: (value: number) => string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const n = categories.length;
  const s = series.length;
  const scale = niceScale(values.flat());
  const plotW = Math.max(0, width - MARGIN.left - MARGIN.right);
  const groupW = n ? plotW / n : 0;
  const barW = Math.max(2, Math.min(MAX_BAR, (groupW * 0.72 - GAP * (s - 1)) / s));
  const groupContent = s * barW + GAP * (s - 1);
  const y = (v: number) => MARGIN.top + height - ((v - scale.min) / (scale.max - scale.min)) * height;
  const zero = y(0);
  const every = labelEvery(n, Math.floor(plotW / 48));

  const indexAt = (e: MouseEvent<SVGSVGElement>) => {
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left - MARGIN.left;
    if (px < 0 || px > plotW) return null;
    return Math.min(n - 1, Math.floor(px / groupW));
  };
  const onKey = (e: KeyboardEvent) => {
    const at = active ?? selected ?? n - 1;
    const next = { ArrowLeft: at - 1, ArrowRight: at + 1, Home: 0, End: n - 1 }[e.key];
    if (next !== undefined) {
      e.preventDefault();
      setActive(Math.min(n - 1, Math.max(0, next)));
    } else if ((e.key === "Enter" || e.key === " ") && active !== null) {
      e.preventDefault();
      onSelect?.(active);
    } else if (e.key === "Escape") setActive(null);
  };
  const gx = (i: number) => MARGIN.left + i * groupW;

  return (
    <div
      ref={ref}
      className="relative rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      style={{ height: height + MARGIN.top + MARGIN.bottom }}
      tabIndex={n ? 0 : -1}
      aria-label={`${label}. Arrow keys move between groups${onSelect ? ", Enter selects one" : ""}.`}
      onKeyDown={onKey}
      onFocus={() => setActive((a) => a ?? selected ?? n - 1)}
      onBlur={() => setActive(null)}
    >
      {width > 0 && n > 0 ? (
        <svg
          width={width}
          height={height + MARGIN.top + MARGIN.bottom}
          onPointerMove={(e) => setActive(indexAt(e))}
          onPointerLeave={() => setActive(null)}
          onClick={(e) => {
            const i = indexAt(e);
            if (i !== null) onSelect?.(i);
          }}
          className={onSelect ? "cursor-pointer" : undefined}
          aria-hidden
        >
          {[selected, active].map((i, k) =>
            i !== null && i !== undefined && (k === 0 || i !== selected) ? (
              <rect
                key={k}
                x={gx(i) + 1}
                y={MARGIN.top}
                width={Math.max(0, groupW - 2)}
                height={height}
                rx={4}
                style={{ fill: "var(--muted)", fillOpacity: k === 0 ? 1 : 0.6 }}
              />
            ) : null
          )}
          {scale.ticks.map((t) => (
            <g key={t}>
              <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(t)} y2={y(t)} style={{ stroke: t === 0 ? "var(--viz-axis)" : "var(--viz-grid)" }} strokeWidth={1} shapeRendering="crispEdges" />
              <text x={MARGIN.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" className="tabular-nums" style={{ fill: "var(--muted-foreground)", fontSize: 11 }}>
                {formatTick(t)}
              </text>
            </g>
          ))}
          {categories.map((c, i) => {
            const start = gx(i) + (groupW - groupContent) / 2;
            return (
              <g key={c.key}>
                {series.map((ser, j) => {
                  const v = values[j]?.[i] ?? 0;
                  const d = barPath(start + j * (barW + GAP), barW, zero, y(v));
                  return d ? <path key={ser.key} d={d} style={{ fill: ser.color }} /> : null;
                })}
                {(n - 1 - i) % every === 0 ? (
                  <text x={gx(i) + groupW / 2} y={MARGIN.top + height + 16} textAnchor="middle" style={{ fill: "var(--muted-foreground)", fontSize: 11 }}>
                    {c.label}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      ) : null}
      <div aria-live="polite" className="pointer-events-none">
        {active !== null && width > 0 ? (
          <div
            className="absolute top-0 z-10 min-w-40 rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md"
            style={{
              left: gx(active) + groupW / 2,
              transform:
                gx(active) < width / 3 ? `translateX(${groupW / 2 + 4}px)` : gx(active) > (2 * width) / 3 ? `translateX(calc(-100% - ${groupW / 2 + 4}px))` : "translateX(-50%)",
            }}
          >
            {tooltip(active)}
          </div>
        ) : null}
      </div>
    </div>
  );
}
