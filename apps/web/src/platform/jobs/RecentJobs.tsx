"use client";

import { useState } from "react";
import { Ban, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { jobsApi } from "./api";
import { JobStatusBadge, jobLabel } from "./JobProgress";
import { useInvalidateJobs, useJobs } from "./queries";
import { isActiveJob, jobDuration } from "./types";

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

/** The user's latest jobs with cancel and retry; refreshes while any of them is active. */
export function RecentJobs({ limit = 8 }: { limit?: number }) {
  const { data: jobs } = useJobs({ limit });
  const invalidate = useInvalidateJobs();
  const [busyId, setBusyId] = useState<string | null>(null);

  const act = async (id: string, action: "cancel" | "retry") => {
    setBusyId(id);
    try {
      await (action === "cancel" ? jobsApi.cancel(id) : jobsApi.retry(id));
      await invalidate();
    } finally {
      setBusyId(null);
    }
  };

  if (!jobs || jobs.length === 0) return null;

  return (
    <Card data-testid="recent-jobs">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Recent jobs</CardTitle>
        <CardDescription>Background work across your tools.</CardDescription>
      </CardHeader>
      <CardContent className="divide-y">
        {jobs.map((job) => (
          <div key={job.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
            <JobStatusBadge status={job.status} />
            <span className="font-medium">{jobLabel(job.type)}</span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              {job.status === "waiting"
                ? job.waitReason
                : job.status === "failed" || job.status === "cancelled"
                  ? job.error
                  : job.stage ?? ""}
              {isActiveJob(job.status) && job.progress > 0 ? ` · ${job.progress}%` : ""}
            </span>
            {jobDuration(job) && <span className="text-xs text-muted-foreground">took {jobDuration(job)}</span>}
            <span className="text-xs text-muted-foreground">{when(job.createdAt)}</span>
            {isActiveJob(job.status) && (
              <Button size="sm" variant="ghost" disabled={busyId === job.id} onClick={() => void act(job.id, "cancel")} title="Cancel">
                <Ban className="h-3.5 w-3.5" />
              </Button>
            )}
            {(job.status === "failed" || job.status === "cancelled") && (
              <Button size="sm" variant="ghost" disabled={busyId === job.id} onClick={() => void act(job.id, "retry")} title="Retry">
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
