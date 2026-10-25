"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { jobsApi } from "./api";
import { isActiveJob, type JobResponse } from "./types";

export interface UseJobOptions {
  /** poll interval while the job is active (ms) */
  intervalMs?: number;
  /** called once when the job reaches a terminal state */
  onSettled?: (job: JobResponse) => void;
}

/**
 * Polls one job while it is active and stops on a terminal state.
 * Pass null to idle (nothing is fetched).
 */
export function useJob(jobId: string | null | undefined, options: UseJobOptions = {}) {
  const { intervalMs = 3000, onSettled } = options;
  const [job, setJob] = useState<JobResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const settledRef = useRef<string | null>(null);
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;

  const refresh = useCallback(async () => {
    if (!jobId) return null;
    try {
      const next = await jobsApi.get(jobId);
      setJob(next);
      setError(null);
      if (!isActiveJob(next.status) && settledRef.current !== next.id) {
        settledRef.current = next.id;
        onSettledRef.current?.(next);
      }
      return next;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load the job");
      return null;
    }
  }, [jobId]);

  useEffect(() => {
    settledRef.current = null;
    setJob(null);
    if (!jobId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const next = await refresh();
      if (cancelled) return;
      if (!next || isActiveJob(next.status)) {
        timer = setTimeout(() => void tick(), intervalMs);
      }
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId, intervalMs, refresh]);

  const cancel = useCallback(async () => {
    if (!jobId) return null;
    const next = await jobsApi.cancel(jobId);
    setJob(next);
    return next;
  }, [jobId]);

  const retry = useCallback(async () => {
    if (!jobId) return null;
    settledRef.current = null;
    const next = await jobsApi.retry(jobId);
    setJob(next);
    // resume polling for the new run
    void refresh();
    return next;
  }, [jobId, refresh]);

  return { job, error, refresh, cancel, retry, isActive: isActiveJob(job?.status) };
}
