"use client";

import { useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { compactNumber, labelEvery, niceScale } from "../../lib/chart";
import { useWidth } from "./useWidth";

export interface LinePoint {
  key: string;
  /** x-axis label */
  label: string;
  /** null leaves a gap */
  value: number | null;
}

const MARGIN = { top: 12, right: 12, bottom: 24, left: 48 };

/**
 * One series over time: a 2px line over a faint wash, hairline grid, and a
 * crosshair whose tooltip follows the pointer or the arrow keys.
 */
export function LineChart({
  points,
  color,
  label,
  tooltip,
  height = 200,
  formatTick = compactNumber,
}: {
  points: LinePoint[];
  /** a CSS color, e.g. "var(--viz-1)" */
  color: string;
  /** what the chart shows, for screen readers */
  label: string;
  tooltip: (index: number) => ReactNode;
  /** plot height; the axis band is added */
  height?: number;
  formatTick?: (value: number) => string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const n = points.length;
  const scale = niceScale(points.flatMap((p) => (p.value === null ? [] : [p.value])));
  const plotW = Math.max(0, width - MARGIN.left - MARGIN.right);
  const x = (i: number) => MARGIN.left + (n <= 1 ? plotW / 2 : (i * plotW) / (n - 1));
  const y = (v: number) => MARGIN.top + height - ((v - scale.min) / (scale.max - scale.min)) * height;
  const zero = y(0);

  const segments: number[][] = [];
  let run: number[] = [];
  points.forEach((p, i) => {
    if (p.value === null) {
      if (run.length) segments.push(run);
      run = [];
    } else run.push(i);
  });
  if (run.length) segments.push(run);
  const line = (seg: number[]) => seg.map((i, k) => `${k ? "L" : "M"}${x(i)},${y(points[i].value!)}`).join("");
  const area = (seg: number[]) => `${line(seg)}L${x(seg[seg.length - 1])},${zero}L${x(seg[0])},${zero}Z`;

  const every = labelEvery(n, Math.floor(plotW / 56));
  const indexAt = (e: PointerEvent<SVGSVGElement>) => {
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left;
    const i = n <= 1 ? 0 : Math.round(((px - MARGIN.left) / plotW) * (n - 1));
    return Math.min(n - 1, Math.max(0, i));
  };
  const onKey = (e: KeyboardEvent) => {
    const at = active ?? n - 1;
    const next = { ArrowLeft: at - 1, ArrowRight: at + 1, Home: 0, End: n - 1 }[e.key];
    if (next !== undefined) {
      e.preventDefault();
      setActive(Math.min(n - 1, Math.max(0, next)));
    } else if (e.key === "Escape") setActive(null);
  };
  const activeValue = active === null ? null : points[active]?.value;
  const ax = active === null ? 0 : x(active);

  return (
    <div
      ref={ref}
      className="relative outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded-md"
      style={{ height: height + MARGIN.top + MARGIN.bottom }}
      tabIndex={n ? 0 : -1}
      aria-label={`${label}. Arrow keys move between points.`}
      onKeyDown={onKey}
      onFocus={() => setActive((a) => a ?? n - 1)}
      onBlur={() => setActive(null)}
    >
      {width > 0 && n > 0 ? (
        <svg width={width} height={height + MARGIN.top + MARGIN.bottom} onPointerMove={(e) => setActive(indexAt(e))} onPointerLeave={() => setActive(null)} aria-hidden>
          {scale.ticks.map((t) => (
            <g key={t}>
              <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(t)} y2={y(t)} style={{ stroke: t === 0 ? "var(--viz-axis)" : "var(--viz-grid)" }} strokeWidth={1} shapeRendering="crispEdges" />
              <text x={MARGIN.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" className="tabular-nums" style={{ fill: "var(--muted-foreground)", fontSize: 11 }}>
                {formatTick(t)}
              </text>
            </g>
          ))}
          {points.map((p, i) =>
            (n - 1 - i) % every === 0 ? (
              <text
                key={p.key}
                x={x(i)}
                y={MARGIN.top + height + 16}
                textAnchor={n > 1 && i === 0 ? "start" : i === n - 1 && n > 1 ? "end" : "middle"}
                style={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              >
                {p.label}
              </text>
            ) : null
          )}
          {segments.map((seg) => (
            <g key={seg[0]}>
              {seg.length > 1 ? (
                <>
                  <path d={area(seg)} style={{ fill: color, fillOpacity: 0.1 }} />
                  <path d={line(seg)} style={{ stroke: color }} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                </>
              ) : (
                <circle cx={x(seg[0])} cy={y(points[seg[0]].value!)} r={3} style={{ fill: color }} />
              )}
            </g>
          ))}
          {active !== null ? (
            <g>
              <line x1={ax} x2={ax} y1={MARGIN.top} y2={MARGIN.top + height} style={{ stroke: "var(--viz-axis)" }} strokeWidth={1} shapeRendering="crispEdges" />
              {activeValue !== null && activeValue !== undefined ? (
                <circle cx={ax} cy={y(activeValue)} r={4} strokeWidth={2} style={{ fill: color, stroke: "var(--viz-ring)" }} />
              ) : null}
            </g>
          ) : null}
        </svg>
      ) : null}
      <div aria-live="polite" className="pointer-events-none">
        {active !== null && width > 0 ? (
          <div
            className="absolute top-0 z-10 min-w-36 rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md"
            style={{
              left: ax,
              transform: ax < width / 3 ? "translateX(12px)" : ax > (2 * width) / 3 ? "translateX(calc(-100% - 12px))" : "translateX(-50%)",
            }}
          >
            {tooltip(active)}
          </div>
        ) : null}
      </div>
    </div>
  );
}
