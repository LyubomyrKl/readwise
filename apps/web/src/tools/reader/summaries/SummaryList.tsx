"use client";

import { Ban, Eye, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JobStatusBadge } from "@platform/jobs/JobProgress";
import { isActiveJob } from "@platform/jobs/types";
import { SUMMARIZATION_STRATEGIES, type SummaryResponse } from "@tools/reader/types";

function strategyLabel(value: string): string {
  return SUMMARIZATION_STRATEGIES.find((s) => s.value === value)?.label ?? value;
}

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

interface SummaryListProps {
  summaries: SummaryResponse[];
  onView: (summary: SummaryResponse) => void;
  onCancel?: (summary: SummaryResponse) => void;
  onRetry?: (summary: SummaryResponse) => void;
  busyId?: string | null;
}

/** The summaries of one document, newest first, with view / cancel / retry. */
export function SummaryList({ summaries, onView, onCancel, onRetry, busyId }: SummaryListProps) {
  if (summaries.length === 0) return null;
  return (
    <ul className="divide-y rounded-xl border bg-card text-left" data-testid="summary-list">
      {summaries.map((summary) => {
        const status = summary.job?.status ?? (summary.state === "ready" ? "succeeded" : "queued");
        const active = isActiveJob(summary.job?.status);
        return (
          <li key={summary.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 text-sm">
            <JobStatusBadge status={status} />
            <span className="font-medium capitalize">{summary.type}</span>
            <span className="text-muted-foreground">{strategyLabel(summary.strategy)}</span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              {active ? summary.job?.waitReason ?? summary.job?.stage ?? "" : summary.job?.error ?? ""}
            </span>
            <span className="text-xs text-muted-foreground">{when(summary.createdAt)}</span>
            {summary.state === "ready" && (
              <Button size="sm" variant="outline" onClick={() => onView(summary)}>
                <Eye className="mr-1 h-3.5 w-3.5" /> View
              </Button>
            )}
            {active && onCancel && (
              <Button size="sm" variant="ghost" disabled={busyId === summary.id} onClick={() => onCancel(summary)} title="Cancel">
                <Ban className="h-3.5 w-3.5" />
              </Button>
            )}
            {(summary.state === "failed" || summary.state === "cancelled") && onRetry && (
              <Button size="sm" variant="ghost" disabled={busyId === summary.id} onClick={() => onRetry(summary)} title="Retry">
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
