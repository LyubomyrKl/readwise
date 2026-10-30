"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Library, Loader2, RotateCcw, Scissors } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { jobsApi } from "@platform/jobs/api";
import { JobProgress } from "@platform/jobs/JobProgress";
import { isActiveJob } from "@platform/jobs/types";
import { useJob } from "@platform/jobs/useJob";
import { readerApi } from "@tools/reader/api";
import { useBookEditions, useInvalidateReader } from "@tools/reader/queries";
import { READER_ROUTES } from "@tools/reader/routes";
import {
  EDITION_FIGURES,
  EDITION_LENGTHS,
  type EditionFigures,
  type EditionLength,
  type EditionResponse,
} from "@tools/reader/types";

function Choice<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string; description: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <fieldset className="mb-4">
      <legend className="mb-2 text-sm font-medium text-muted-foreground">{label}</legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-lg border-2 p-3 text-left transition-all",
              value === option.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
            )}
          >
            <div className="text-sm font-medium">{option.label}</div>
            <div className="mt-1 text-xs text-muted-foreground">{option.description}</div>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** Live progress of the edition being made. */
function EditionProgress({ edition, onSettled }: { edition: EditionResponse; onSettled: () => void }) {
  const { job, cancel, isActive } = useJob(edition.jobId ?? null, { onSettled });
  if (!job) return <p className="text-sm text-muted-foreground">Loading job…</p>;
  return <JobProgress job={job} onCancel={isActive ? cancel : undefined} className="text-left" />;
}

function percent(value?: number): string {
  return typeof value === "number" ? `${Math.round(value * 100)}%` : "–";
}

/**
 * The abridged edition of a book: the book's own chapters, each opening with a short summary,
 * the text compressed by how dense each part is, and its pictures. The finished EPUB is a book
 * of the library, so it opens in the reader with highlights and notes.
 */
export function EditionPanel({ bookId }: { bookId: string }) {
  const router = useRouter();
  const editionsQuery = useBookEditions(bookId);
  const invalidate = useInvalidateReader();
  const [length, setLength] = useState<EditionLength>("standard");
  const [figures, setFigures] = useState<EditionFigures>("key");
  const [busy, setBusy] = useState(false);

  const editions = editionsQuery.data ?? [];
  const active = editions.find((e) => isActiveJob(e.job?.status));
  const ready = editions.find((e) => e.state === "ready" && e.editionBookId);
  const newest = editions[0];
  const failed = !active && newest && (newest.state === "failed" || newest.state === "cancelled") ? newest : null;

  const start = async () => {
    setBusy(true);
    try {
      const created = await readerApi.editions.create(bookId, { length, figures });
      toast.success(created.existing ? "This edition already exists or is being made" : "Making the abridged edition");
      await invalidate(bookId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start the edition");
    } finally {
      setBusy(false);
    }
  };

  const retry = async (edition: EditionResponse) => {
    if (!edition.jobId) return;
    setBusy(true);
    try {
      await jobsApi.retry(edition.jobId);
      await invalidate(bookId);
      toast.success("Job queued again");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Retry failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-2xl px-6 pt-10" data-testid="edition-panel">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
          <Scissors className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Abridged edition</h2>
          <p className="text-sm text-muted-foreground">
            The book&apos;s own chapters, each with a short summary, compressed by how dense each part is, with its
            pictures. Added to your library as an EPUB.
          </p>
        </div>
      </div>

      {active ? (
        <div className="rounded-xl border bg-card p-4">
          <EditionProgress edition={active} onSettled={() => void invalidate(bookId)} />
          <p className="mt-2 text-xs text-muted-foreground">
            Chapters are done one after another and kept as they finish; you can leave and come back.
          </p>
        </div>
      ) : null}

      {ready && !active ? (
        <div className="mb-6 rounded-xl border bg-card p-4" data-testid="edition-ready">
          <p className="text-sm">
            Ready: {ready.result?.chapters ?? "–"} chapters at {percent(ready.result?.ratio)} of the original
            {typeof ready.result?.pictures === "number" ? `, ${ready.result.pictures} pictures` : ""}
            {ready.result?.fixedSentences ? `, ${ready.result.fixedSentences} sentences corrected by the fact-check` : ""}.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => router.push(READER_ROUTES.bookReader(ready.editionBookId!))}>
              <BookOpen className="h-4 w-4" /> Read the edition
            </Button>
            <Button variant="outline" onClick={() => router.push(READER_ROUTES.bookProfile(ready.editionBookId!))}>
              <Library className="h-4 w-4" /> In the library
            </Button>
          </div>
          {ready.result?.warnings?.length ? (
            <ul className="mt-3 list-disc pl-5 text-xs text-muted-foreground">
              {ready.result.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {failed ? (
        <div className="mb-6 rounded-xl border border-destructive/40 p-4 text-sm">
          <p>The last edition did not finish: {failed.job?.error ?? failed.state}.</p>
          <Button className="mt-2" variant="outline" size="sm" disabled={busy} onClick={() => void retry(failed)}>
            <RotateCcw className="h-4 w-4" /> Continue it
          </Button>
        </div>
      ) : null}

      {!active ? (
        <div>
          <Choice label="Length" options={EDITION_LENGTHS} value={length} onChange={setLength} />
          <Choice label="Pictures" options={EDITION_FIGURES} value={figures} onChange={setFigures} />
          <Button onClick={() => void start()} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />}
            {ready ? "Make another edition" : "Make abridged edition"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
