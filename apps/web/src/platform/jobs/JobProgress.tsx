"use client";

import { AlertTriangle, Ban, CheckCircle2, Clock, Loader2, PauseCircle, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isActiveJob, type JobResponse, type JobStatus } from "./types";

const STATUS_LABEL: Record<JobStatus, string> = {
  queued: "Queued",
  running: "Running",
  waiting: "Waiting",
  succeeded: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
};

const STATUS_CLASS: Record<JobStatus, string> = {
  queued: "bg-muted text-muted-foreground",
  running: "bg-primary/10 text-primary",
  waiting: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  succeeded: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  failed: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

export function JobStatusBadge({ status, className }: { status: JobStatus; className?: string }) {
  const Icon =
    status === "running" ? Loader2 : status === "waiting" ? PauseCircle : status === "succeeded" ? CheckCircle2
      : status === "failed" ? AlertTriangle : status === "cancelled" ? Ban : Clock;
  return (
    <Badge variant="outline" className={cn("gap-1 border-transparent", STATUS_CLASS[status], className)}>
      <Icon className={cn("h-3 w-3", status === "running" && "animate-spin")} />
      {STATUS_LABEL[status]}
    </Badge>
  );
}

/** "reader.summarize" -> "Summarize" */
export function jobLabel(type: string): string {
  const name = type.split(".").pop() ?? type;
  return name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, " ");
}

export interface JobProgressProps {
  job: JobResponse;
  /** the job this one waits for (e.g. the extraction before a summary) */
  parent?: JobResponse | null;
  onCancel?: () => void | Promise<unknown>;
  onRetry?: () => void | Promise<unknown>;
  busy?: boolean;
  className?: string;
}

/** Stage, progress bar, the waiting hint and the cancel/retry actions of one job. */
export function JobProgress({ job, parent, onCancel, onRetry, busy, className }: JobProgressProps) {
  const waitingOnParent = job.status === "queued" && parent && isActiveJob(parent.status);
  const shown = waitingOnParent ? parent! : job;
  const waiting = shown.status === "waiting";
  const stage = waitingOnParent
    ? `${jobLabel(parent!.type)}: ${parent!.stage ?? "in progress"}`
    : shown.stage ?? (shown.status === "queued" ? "Waiting for a worker" : null);
  const progress = waitingOnParent ? Math.min(5, parent!.progress) : shown.progress;

  return (
    <div className={cn("space-y-3", className)} data-testid="job-progress">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <JobStatusBadge status={shown.status} />
          <span className="truncate text-sm text-muted-foreground">{stage}</span>
        </div>
        <span className="text-sm font-medium tabular-nums">{Math.round(progress)}%</span>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all duration-500", waiting ? "bg-amber-500" : "bg-primary")}
          style={{ width: `${Math.max(2, Math.min(100, progress))}%` }}
        />
      </div>

      {waiting && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          <p className="font-medium text-amber-700 dark:text-amber-400">Waiting: {shown.waitReason ?? "the worker is paused"}</p>
          <p className="mt-1 text-muted-foreground">
            Start the LLM host and leave this job alone: it checks again by itself and continues where it stopped.
          </p>
        </div>
      )}

      {(job.status === "failed" || job.status === "cancelled") && job.error && (
        <p className="text-sm text-destructive break-words">{job.error}</p>
      )}

      {(onCancel || onRetry) && (
        <div className="flex gap-2">
          {onCancel && isActiveJob(job.status) && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void onCancel()}>
              <Ban className="mr-1 h-3.5 w-3.5" /> Cancel
            </Button>
          )}
          {onRetry && (job.status === "failed" || job.status === "cancelled") && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void onRetry()}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" /> Retry
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
