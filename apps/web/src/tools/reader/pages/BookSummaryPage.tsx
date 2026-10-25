"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { IBook, type SummaryResponse } from "@tools/reader/types";
import { readerApi } from "@tools/reader/api";
import { jobsApi } from "@platform/jobs/api";
import { isActiveJob, type JobResponse } from "@platform/jobs/types";
import type { Summary } from "@tools/reader/summaries/types";
import { ErrorState, Loader, Processing, SummaryReader, GenerateSummaryState } from "@tools/reader/summaries";
import { SummaryList } from "@tools/reader/summaries/SummaryList";

/**
 * The summaries of one document. The newest ready summary opens in the reader;
 * an active job shows its real progress; a failed attempt offers a retry; and
 * a new summary (with its own strategy) can be started at any time.
 */
export default function BookSummaryPage() {
  const params = useParams();
  const bookId = params.id as string;

  const [book, setBook] = useState<IBook | null>(null);
  const [summaries, setSummaries] = useState<SummaryResponse[]>([]);
  const [viewing, setViewing] = useState<{ id: string; summary: Summary } | null>(null);
  const [showOverview, setShowOverview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refreshSummaries = useCallback(async () => {
    const list = await readerApi.summaries.listForBook(bookId);
    setSummaries(list);
    return list;
  }, [bookId]);

  const view = useCallback(async (summary: SummaryResponse) => {
    const content = await readerApi.summaries.content(summary.id);
    setViewing({ id: summary.id, summary: content.summary });
    setShowOverview(false);
  }, []);

  useEffect(() => {
    if (!bookId) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [loadedBook, list] = await Promise.all([readerApi.documents.get(bookId), readerApi.summaries.listForBook(bookId)]);
        if (cancelled) return;
        setBook(loadedBook);
        setSummaries(list);
        const newest = list[0];
        if (newest?.state === "ready") await view(newest);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load the summary");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookId, view]);

  const onJobSettled = useCallback(
    async (job: JobResponse) => {
      const list = await refreshSummaries();
      if (job.status === "succeeded") {
        const ready = list.find((s) => s.jobId === job.id && s.state === "ready") ?? list.find((s) => s.state === "ready");
        if (ready) await view(ready);
      }
    },
    [refreshSummaries, view]
  );

  const retry = async (summary: SummaryResponse) => {
    if (!summary.jobId) return;
    setBusyId(summary.id);
    try {
      await jobsApi.retry(summary.jobId);
      await refreshSummaries();
      toast.success("Job queued again");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Retry failed");
    } finally {
      setBusyId(null);
    }
  };

  const cancel = async (summary: SummaryResponse) => {
    if (!summary.jobId) return;
    setBusyId(summary.id);
    try {
      await jobsApi.cancel(summary.jobId);
      await refreshSummaries();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Cancel failed");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <Loader />;
  if (error) return <ErrorState error={error} />;

  if (viewing && !showOverview) {
    return <SummaryReader summary={viewing.summary} />;
  }

  const newest = summaries[0];
  const active = summaries.find((s) => isActiveJob(s.job?.status));
  const others = summaries.filter((s) => s.id !== active?.id);

  return (
    <div className="min-h-screen bg-background">
      {active ? (
        <Processing jobId={active.jobId!} parentJobId={active.job?.parentJobId} onSettled={onJobSettled} />
      ) : (
        <GenerateSummaryState
          book={book}
          setError={setError}
          retry={newest?.state === "failed" || newest?.state === "cancelled"}
          onStarted={async (created) => {
            const list = await refreshSummaries();
            if (created.existing && created.storageKey) {
              const ready = list.find((s) => s.id === created.summaryId);
              if (ready) await view(ready);
            }
          }}
        />
      )}

      {others.length > 0 && (
        <div className="mx-auto w-full max-w-2xl px-6 pb-12">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {active ? "Previous summaries" : "Summaries"}
          </h3>
          <SummaryList summaries={others} onView={(s) => void view(s)} onCancel={(s) => void cancel(s)} onRetry={(s) => void retry(s)} busyId={busyId} />
        </div>
      )}
      {newest && (newest.state === "failed" || newest.state === "cancelled") && !active && (
        <div className="mx-auto w-full max-w-2xl px-6 pb-12 text-center">
          <p className="text-sm text-muted-foreground">
            Last attempt: {newest.job?.error ?? newest.state}.{" "}
            <button className="underline" onClick={() => void retry(newest)} disabled={busyId === newest.id}>
              Retry that job
            </button>
          </p>
        </div>
      )}
    </div>
  );
}
