"use client";

import { useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { compactNumber, labelEvery, niceScale } from "../../lib/chart";
import { useWidth } from "./useWidth";

export interface BandSeries {
  key: string;
  /** a CSS color, e.g. "var(--viz-2)" */
  color: string;
  /** one value per point; null leaves a gap */
  values: (number | null)[];
  /** dashed: what is usual or projected, not what happened */
  dashed?: boolean;
  /** a label by the series' last point, so identity is never color alone */
  endLabel?: string;
}

const MARGIN = { top: 16, right: 12, bottom: 24, left: 48 };

/** Runs of consecutive indexes that have a value. */
function runs(values: readonly (number | null)[]): number[][] {
  const out: number[][] = [];
  let run: number[] = [];
  values.forEach((v, i) => {
    if (v === null) {
      if (run.length) out.push(run);
      run = [];
    } else run.push(i);
  });
  if (run.length) out.push(run);
  return out;
}

/**
 * What happened against what is usual or projected: solid lines for what happened, dashed ones for
 * the usual or the projection, the likely range (low to high) as a faint wash, a mark for today, and
 * finish lines across the plot (dotted, labelled at the left; one far above what is drawn is left to
 * the list beside the chart rather than flattening it). Hairline grid, one axis; the crosshair and
 * its tooltip follow the pointer or the arrow keys.
 */
export function BandChart({
  labels,
  series,
  band,
  marker,
  references,
  label,
  tooltip,
  height = 220,
  formatTick = compactNumber,
}: {
  /** x-axis labels, one per point */
  labels: string[];
  series: BandSeries[];
  band?: { low: (number | null)[]; high: (number | null)[]; color: string };
  marker?: { index: number; label: string };
  /** finish lines: a value to reach, drawn across */
  references?: { value: number; label: string }[];
  /** what the chart shows, for screen readers */
  label: string;
  tooltip: (index: number) => ReactNode;
  height?: number;
  formatTick?: (value: number) => string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const n = labels.length;
  const all = [...series.flatMap((s) => s.values), ...(band ? [...band.low, ...band.high] : [])].filter((v): v is number => v !== null);
  const top = Math.max(0, ...all);
  const lines = (references ?? []).filter((r) => r.value <= Math.max(top * 1.5, 1));
  const scale = niceScale([...all, ...lines.map((r) => r.value)]);
  const plotW = Math.max(0, width - MARGIN.left - MARGIN.right);
  const x = (i: number) => MARGIN.left + (n <= 1 ? plotW / 2 : (i * plotW) / (n - 1));
  const y = (v: number) => MARGIN.top + height - ((v - scale.min) / (scale.max - scale.min)) * height;
  const path = (values: readonly (number | null)[], run: number[]) => run.map((i, k) => `${k ? "L" : "M"}${x(i)},${y(values[i]!)}`).join("");
  const bandRuns = band ? runs(band.low.map((v, i) => (v === null || band.high[i] === null ? null : v))) : [];
  const bandPath = (run: number[]) =>
    `${path(band!.high, run)}${[...run].reverse().map((i) => `L${x(i)},${y(band!.low[i]!)}`).join("")}Z`;

  // room for a label each, the last one anchored at its end ("Nov 31") clear of the one before
  const every = labelEvery(n, Math.floor(plotW / 56));
  const indexAt = (e: PointerEvent<SVGSVGElement>) => {
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left;
    const i = n <= 1 ? 0 : Math.round(((px - MARGIN.left) / plotW) * (n - 1));
    return Math.min(n - 1, Math.max(0, i));
  };
  const onKey = (e: KeyboardEvent) => {
    const at = active ?? marker?.index ?? n - 1;
    const next = { ArrowLeft: at - 1, ArrowRight: at + 1, Home: 0, End: n - 1 }[e.key];
    if (next !== undefined) {
      e.preventDefault();
      setActive(Math.min(n - 1, Math.max(0, next)));
    } else if (e.key === "Escape") setActive(null);
  };
  const ax = active === null ? 0 : x(active);

  return (
    <div
      ref={ref}
      className="relative rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      style={{ height: height + MARGIN.top + MARGIN.bottom }}
      tabIndex={n ? 0 : -1}
      aria-label={`${label}. Arrow keys move between points.`}
      onKeyDown={onKey}
      onFocus={() => setActive((a) => a ?? marker?.index ?? n - 1)}
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
          {labels.map((l, i) =>
            (n - 1 - i) % every === 0 ? (
              <text
                key={i}
                x={x(i)}
                y={MARGIN.top + height + 16}
                textAnchor={n > 1 && i === 0 ? "start" : i === n - 1 && n > 1 ? "end" : "middle"}
                style={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              >
                {l}
              </text>
            ) : null
          )}
          {band ? bandRuns.map((run) => <path key={run[0]} d={bandPath(run)} style={{ fill: band.color, fillOpacity: 0.12 }} />) : null}
          {lines.map((r) => (
            <g key={`ref-${r.value}`}>
              <line
                x1={MARGIN.left}
                x2={width - MARGIN.right}
                y1={y(r.value)}
                y2={y(r.value)}
                style={{ stroke: "var(--muted-foreground)" }}
                strokeWidth={1.5}
                strokeDasharray="1 4"
                strokeLinecap="round"
              />
              <text x={MARGIN.left + 4} y={y(r.value) - 6} style={{ fill: "var(--muted-foreground)", fontSize: 11 }}>
                {r.label}
              </text>
            </g>
          ))}
          {marker ? (
            <g>
              <line
                x1={x(marker.index)}
                x2={x(marker.index)}
                y1={MARGIN.top}
                y2={MARGIN.top + height}
                style={{ stroke: "var(--viz-axis)" }}
                strokeWidth={1}
                strokeDasharray="2 3"
                shapeRendering="crispEdges"
              />
              {/* at the foot of its line, clear of the series' labels along the top */}
              <text
                x={x(marker.index) + (x(marker.index) > width * 0.7 ? -4 : 4)}
                y={MARGIN.top + height - 6}
                textAnchor={x(marker.index) > width * 0.7 ? "end" : "start"}
                style={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              >
                {marker.label}
              </text>
            </g>
          ) : null}
          {series.map((s) =>
            runs(s.values).map((run) =>
              run.length > 1 ? (
                <path
                  key={`${s.key}-${run[0]}`}
                  d={path(s.values, run)}
                  style={{ stroke: s.color }}
                  fill="none"
                  strokeWidth={2}
                  strokeDasharray={s.dashed ? "5 4" : undefined}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ) : (
                <circle key={`${s.key}-${run[0]}`} cx={x(run[0])} cy={y(s.values[run[0]]!)} r={3} style={{ fill: s.color }} />
              )
            )
          )}
          {series.map((s) => {
            const last = s.values.map((v, i) => (v === null ? -1 : i)).reduce((a, b) => Math.max(a, b), -1);
            if (!s.endLabel || last < 0) return null;
            const lx = x(last);
            return (
              <text
                key={`${s.key}-label`}
                x={lx}
                y={y(s.values[last]!) - 8}
                textAnchor={lx > width * 0.8 ? "end" : lx < width * 0.2 ? "start" : "middle"}
                style={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              >
                {s.endLabel}
              </text>
            );
          })}
          {active !== null ? (
            <g>
              <line x1={ax} x2={ax} y1={MARGIN.top} y2={MARGIN.top + height} style={{ stroke: "var(--viz-axis)" }} strokeWidth={1} shapeRendering="crispEdges" />
              {series.map((s) =>
                s.values[active] === null || s.values[active] === undefined ? null : (
                  <circle key={s.key} cx={ax} cy={y(s.values[active]!)} r={4} strokeWidth={2} style={{ fill: s.color, stroke: "var(--viz-ring)" }} />
                )
              )}
            </g>
          ) : null}
        </svg>
      ) : null}
      <div aria-live="polite" className="pointer-events-none">
        {active !== null && width > 0 ? (
          <div
            className="absolute top-0 z-10 min-w-40 rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md"
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
