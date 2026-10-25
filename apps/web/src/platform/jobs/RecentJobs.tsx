"use client";

import { useCallback, useEffect, useState } from "react";
import { Ban, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { jobsApi } from "./api";
import { JobStatusBadge, jobLabel } from "./JobProgress";
import { isActiveJob, type JobResponse } from "./types";

const REFRESH_MS = 5000;

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

/** The user's latest jobs with cancel and retry; polls while any of them is active. */
export function RecentJobs({ limit = 8 }: { limit?: number }) {
  const [jobs, setJobs] = useState<JobResponse[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setJobs(await jobsApi.list({ limit }));
    } catch {
      setJobs((prev) => prev ?? []);
    }
  }, [limit]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!jobs?.some((j) => isActiveJob(j.status))) return;
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [jobs, load]);

  const act = async (id: string, action: "cancel" | "retry") => {
    setBusyId(id);
    try {
      await (action === "cancel" ? jobsApi.cancel(id) : jobsApi.retry(id));
      await load();
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
