"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiUrl } from "@platform/api/http";
import { jobsApi } from "./api";
import { isActiveJob, type JobResponse } from "./types";

export interface UseJobOptions {
  /** poll interval when the event stream is unavailable (ms) */
  intervalMs?: number;
  /** called once when the job reaches a terminal state */
  onSettled?: (job: JobResponse) => void;
}

/**
 * Follows one job: a server-sent event stream (GET /jobs/:id/stream through the
 * proxy) delivers every change; when the stream cannot be opened the hook polls.
 * Pass null to idle. Stops on a terminal state; retry() resubscribes.
 */
export function useJob(jobId: string | null | undefined, options: UseJobOptions = {}) {
  const { intervalMs = 3000, onSettled } = options;
  const [job, setJob] = useState<JobResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const settledRef = useRef<string | null>(null);
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;

  const absorb = useCallback((next: JobResponse): boolean => {
    setJob(next);
    setError(null);
    const terminal = !isActiveJob(next.status);
    if (terminal && settledRef.current !== `${next.id}:${next.attempts}:${next.status}`) {
      settledRef.current = `${next.id}:${next.attempts}:${next.status}`;
      onSettledRef.current?.(next);
    }
    return terminal;
  }, []);

  const refresh = useCallback(async () => {
    if (!jobId) return null;
    try {
      const next = await jobsApi.get(jobId);
      absorb(next);
      return next;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load the job");
      return null;
    }
  }, [jobId, absorb]);

  useEffect(() => {
    settledRef.current = null;
    setJob(null);
    if (!jobId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let source: EventSource | null = null;

    const poll = async () => {
      const next = await refresh();
      if (stopped) return;
      if (!next || isActiveJob(next.status)) {
        timer = setTimeout(() => void poll(), intervalMs);
      }
    };

    if (typeof EventSource === "undefined") {
      void poll();
    } else {
      let received = false;
      source = new EventSource(apiUrl(`/jobs/${encodeURIComponent(jobId)}/stream`));
      source.addEventListener("job", (event) => {
        received = true;
        try {
          const terminal = absorb(JSON.parse((event as MessageEvent<string>).data) as JobResponse);
          if (terminal) {
            source?.close();
            source = null;
          }
        } catch {
          // ignore a malformed frame; the next one or the poll catches up
        }
      });
      source.onerror = () => {
        // the server ends the stream after the terminal state; anything else: fall back to polling
        source?.close();
        source = null;
        if (!stopped && (!received || isActiveJob(job?.status))) void poll();
      };
    }

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      source?.close();
    };
    // `job` is intentionally not a dependency: the stream decides when to stop
  }, [jobId, intervalMs, refresh, absorb, generation]);

  const cancel = useCallback(async () => {
    if (!jobId) return null;
    const next = await jobsApi.cancel(jobId);
    absorb(next);
    return next;
  }, [jobId, absorb]);

  const retry = useCallback(async () => {
    if (!jobId) return null;
    const next = await jobsApi.retry(jobId);
    settledRef.current = null;
    setJob(next);
    setGeneration((g) => g + 1); // resubscribe for the new run
    return next;
  }, [jobId]);

  return { job, error, refresh, cancel, retry, isActive: isActiveJob(job?.status) };
}
