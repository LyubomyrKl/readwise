"use client";

import { isActiveJob } from "@platform/jobs/types";
import { cn } from "@/lib/utils";
import { useBookEditions } from "@tools/reader/queries";
import { describeEditionError, parseStage } from "./progress";

/** One line under the book's "Abridged edition" button: the edition being made, why the last one stopped,
 * or that one is ready. Nothing when the book has no edition. */
export function EditionStatusLine({ bookId, className }: { bookId: string; className?: string }) {
  const { data } = useBookEditions(bookId);
  const editions = data ?? [];
  const active = editions.find((e) => isActiveJob(e.job?.status));
  const newest = editions[0];

  if (active?.job) {
    const info = parseStage(active.job.stage, active.job.status);
    const progress = Math.round(active.job.progress);
    return (
      <div className={cn("space-y-1", className)} data-testid="edition-status">
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Edition progress"
             aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
          <div className={cn("h-full rounded-full", info.paused ? "bg-amber-500" : "bg-primary")}
               style={{ width: `${Math.max(2, progress)}%` }} />
        </div>
        <p className="text-xs text-muted-foreground">
          Abridged edition: {info.label.charAt(0).toLowerCase() + info.label.slice(1)} · {progress}%
        </p>
      </div>
    );
  }
  if (newest && (newest.state === "failed" || newest.state === "cancelled")) {
    return (
      <p className={cn("text-xs text-destructive", className)} data-testid="edition-status">
        The last abridged edition stopped: {describeEditionError(newest.job?.error, newest.job?.status).title.toLowerCase()}.
      </p>
    );
  }
  if (editions.some((e) => e.state === "ready" && e.editionBookId)) {
    return (
      <p className={cn("text-xs text-muted-foreground", className)} data-testid="edition-status">
        An abridged edition is in your library.
      </p>
    );
  }
  return null;
}
