"use client";

import { useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { barPath, compactNumber, labelEvery, niceScale } from "../../lib/chart";
import { useWidth } from "./useWidth";

export interface StackSeries {
  key: string;
  /** a CSS color, e.g. "var(--viz-7)" */
  color: string;
  /** one signed value per column */
  values: number[];
}

const MARGIN = { top: 12, right: 12, bottom: 24, left: 48 };
/** the surface gap between stacked segments */
const GAP = 2;
const MAX_BAR = 28;

/**
 * Signed parts of a whole, a column each: the positive parts stacked up from zero and the negative
 * ones down, in series order, 2px apart and rounded only at each stack's outer end; a dot ringed in
 * the surface marks the column's net. One hover target per column with its tooltip; the arrow keys
 * move between columns. A part too thin to draw apart stays in the tooltip and the table.
 */
export function StackedBars({
  categories,
  series,
  net,
  label,
  tooltip,
  height = 200,
  formatTick = compactNumber,
}: {
  categories: { key: string; label: string }[];
  series: StackSeries[];
  /** the net of each column, as a dot */
  net?: number[];
  label: string;
  tooltip: (index: number) => ReactNode;
  height?: number;
  formatTick?: (value: number) => string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const n = categories.length;
  // each column's stack: where every part starts and ends, in values
  const stacks = categories.map((_, i) => {
    let up = 0;
    let down = 0;
    return series.map((s) => {
      const v = s.values[i] ?? 0;
      if (v >= 0) return { from: up, to: (up += v) };
      return { from: down, to: (down += v) };
    });
  });
  const scale = niceScale([...stacks.flatMap((st) => st.map((part) => part.to)), ...(net ?? [])]);
  const plotW = Math.max(0, width - MARGIN.left - MARGIN.right);
  const colW = n ? plotW / n : 0;
  const barW = Math.max(4, Math.min(MAX_BAR, colW * 0.6));
  const y = (v: number) => MARGIN.top + height - ((v - scale.min) / (scale.max - scale.min)) * height;
  const cx = (i: number) => MARGIN.left + i * colW + colW / 2;
  const every = labelEvery(n, Math.floor(plotW / 48));

  const indexAt = (e: PointerEvent<SVGSVGElement>) => {
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left - MARGIN.left;
    if (px < 0 || px > plotW || n === 0) return null;
    return Math.min(n - 1, Math.floor(px / colW));
  };
  const onKey = (e: KeyboardEvent) => {
    const at = active ?? n - 1;
    const next = { ArrowLeft: at - 1, ArrowRight: at + 1, Home: 0, End: n - 1 }[e.key];
    if (next !== undefined) {
      e.preventDefault();
      setActive(Math.min(n - 1, Math.max(0, next)));
    } else if (e.key === "Escape") setActive(null);
  };

  return (
    <div
      ref={ref}
      className="relative rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      style={{ height: height + MARGIN.top + MARGIN.bottom }}
      tabIndex={n ? 0 : -1}
      aria-label={`${label}. Arrow keys move between columns.`}
      onKeyDown={onKey}
      onFocus={() => setActive((a) => a ?? n - 1)}
      onBlur={() => setActive(null)}
    >
      {width > 0 && n > 0 ? (
        <svg width={width} height={height + MARGIN.top + MARGIN.bottom} onPointerMove={(e) => setActive(indexAt(e))} onPointerLeave={() => setActive(null)} aria-hidden>
          {active !== null ? (
            <rect x={cx(active) - colW / 2 + 1} y={MARGIN.top} width={Math.max(0, colW - 2)} height={height} rx={4} style={{ fill: "var(--muted)", fillOpacity: 0.6 }} />
          ) : null}
          {scale.ticks.map((t) => (
            <g key={t}>
              <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(t)} y2={y(t)} style={{ stroke: t === 0 ? "var(--viz-axis)" : "var(--viz-grid)" }} strokeWidth={1} shapeRendering="crispEdges" />
              <text x={MARGIN.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" className="tabular-nums" style={{ fill: "var(--muted-foreground)", fontSize: 11 }}>
                {formatTick(t)}
              </text>
            </g>
          ))}
          {categories.map((c, i) => (
            <g key={c.key}>
              {stacks[i].map((part, j) => {
                if (part.from === part.to) return null;
                const up = part.to > part.from;
                // the outermost part on its side of zero carries the rounded end
                const outer = !stacks[i].slice(j + 1).some((later) => later.to !== later.from && later.to > later.from === up);
                // a part stacked on another starts a gap away from it
                const base = y(part.from) + (part.from === 0 ? 0 : up ? -GAP : GAP);
                const end = y(part.to);
                if (up ? end >= base : end <= base) return null;
                return <path key={series[j].key} d={barPath(cx(i) - barW / 2, barW, base, end, outer ? 4 : 0)} style={{ fill: series[j].color }} />;
              })}
              {net ? <circle cx={cx(i)} cy={y(net[i])} r={4} strokeWidth={2} style={{ fill: "var(--foreground)", stroke: "var(--viz-ring)" }} /> : null}
              {(n - 1 - i) % every === 0 ? (
                <text x={cx(i)} y={MARGIN.top + height + 16} textAnchor="middle" style={{ fill: "var(--muted-foreground)", fontSize: 11 }}>
                  {c.label}
                </text>
              ) : null}
            </g>
          ))}
        </svg>
      ) : null}
      <div aria-live="polite" className="pointer-events-none">
        {active !== null && width > 0 ? (
          <div
            className="absolute top-0 z-10 min-w-48 rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md"
            style={{
              left: cx(active),
              transform:
                cx(active) < width / 3 ? `translateX(${colW / 2 + 4}px)` : cx(active) > (2 * width) / 3 ? `translateX(calc(-100% - ${colW / 2 + 4}px))` : "translateX(-50%)",
            }}
          >
            {tooltip(active)}
          </div>
        ) : null}
      </div>
    </div>
  );
}
