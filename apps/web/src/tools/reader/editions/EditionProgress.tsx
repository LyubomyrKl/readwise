"use client";

import { useEffect, useRef, useState } from "react";
import { Ban, Check, CheckCircle2, Circle, Loader2, PauseCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useJob } from "@platform/jobs/useJob";
import type { JobResponse } from "@platform/jobs/types";
import { useEditionProgress } from "@tools/reader/queries";
import type { EditionChapterProgress, EditionResponse } from "@tools/reader/types";
import {
  EDITION_STEPS,
  formatDuration,
  parseStage,
  remainingMs,
  runningMs,
  type EditionPhase,
  type Sample,
  type StageInfo,
} from "./progress";

/** A queued job nobody picked up for this long probably has no worker listening. */
const QUEUED_HINT_MS = 2 * 60_000;
const WORKING: EditionPhase[] = ["writing", "checking", "fixing"];

/** Progress values seen while the page is open, for the time left (see remainingMs). */
function useSamples(job: JobResponse | null): Sample[] {
  const samples = useRef<Sample[]>([]);
  const [, rerender] = useState(0);
  const status = job?.status;
  const progress = job?.progress;
  useEffect(() => {
    if (status !== "running" || progress === undefined) {
      if (status === "waiting") samples.current = []; // the pause would make the pace look slower than it is
      return;
    }
    const now = Date.now();
    const list = samples.current;
    const last = list[list.length - 1];
    if (last && progress < last.progress) samples.current = []; // started again
    if (!last || progress !== last.progress) {
      samples.current = [...samples.current.filter((s) => now - s.at < 30 * 60_000), { at: now, progress }];
      rerender((n) => n + 1);
    }
  }, [status, progress]);
  return samples.current;
}

function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function Steps({ info, factcheck }: { info: StageInfo; factcheck?: string | null }) {
  const steps = EDITION_STEPS.filter((s) => factcheck !== "off" || (s.phase !== "checking" && s.phase !== "fixing"));
  const current = info.phase === "done" ? steps.length : Math.max(0, steps.findIndex((s) => s.phase === info.phase));
  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs" data-testid="edition-steps">
      {steps.map((step, index) => {
        const state = index < current ? "done" : index === current && info.phase !== "queued" ? "current" : "todo";
        return (
          <li key={step.phase} data-state={state} className="flex items-center gap-1">
            {index > 0 && <span className="mx-1 h-px w-3 bg-border" aria-hidden />}
            {state === "done" ? (
              <Check className="h-3.5 w-3.5 text-emerald-600" />
            ) : state === "current" ? (
              info.paused ? <PauseCircle className="h-3.5 w-3.5 text-amber-600" /> : <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            ) : (
              <Circle className="h-3.5 w-3.5 text-muted-foreground/50" />
            )}
            <span className={cn(state === "current" ? "font-medium text-foreground" : "text-muted-foreground")}>{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function chapterNote(chapter: EditionChapterProgress, current: boolean, info: StageInfo, factcheck?: string | null) {
  if (current && info.phase === "writing") return { icon: "busy", text: "writing…" } as const;
  if (current && info.phase === "checking") return { icon: "busy", text: "fact-checking…" } as const;
  if (current && info.phase === "fixing") return { icon: "busy", text: "correcting…" } as const;
  const finished = chapter.state === "fixed" || (chapter.state !== "pending" && factcheck === "off");
  if (finished) return { icon: "done", text: "done" } as const;
  if (chapter.state === "checked") return { icon: "half", text: "checked" } as const;
  if (chapter.state === "written") return { icon: "half", text: "written" } as const;
  return { icon: "todo", text: "" } as const;
}

function ChapterList({ chapters, info, factcheck }: { chapters: EditionChapterProgress[]; info: StageInfo; factcheck?: string | null }) {
  let number = 0;
  return (
    <ol className="max-h-72 space-y-1 overflow-y-auto pr-1 text-sm" data-testid="edition-chapters">
      {chapters.map((chapter) => {
        if (chapter.divider) {
          return (
            <li key={chapter.id} className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {chapter.title}
            </li>
          );
        }
        number += 1;
        const current = info.chapter === number && WORKING.includes(info.phase);
        const note = chapterNote(chapter, current, info, factcheck);
        return (
          <li key={chapter.id} data-state={current ? "current" : chapter.state} className={cn("flex items-center gap-2", chapter.level > 1 && "pl-3")}>
            {note.icon === "busy" ? (
              info.paused ? <PauseCircle className="h-4 w-4 shrink-0 text-amber-600" /> : <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
            ) : note.icon === "done" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            ) : note.icon === "half" ? (
              <Check className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <Circle className="h-4 w-4 shrink-0 text-muted-foreground/40" />
            )}
            <span className={cn("min-w-0 flex-1 truncate", current && "font-medium")}>{chapter.title}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {note.text ? `${note.text} · ` : ""}
              {chapter.words.toLocaleString()} words
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * An edition being made: the steps, the bar, how long it has been running and about how long is left,
 * the chapters with their state, and what a pause means. Updates with every event of the job.
 */
export function EditionProgress({ edition, onSettled }: { edition: EditionResponse; onSettled: () => void }) {
  const { job, cancel, isActive } = useJob(edition.jobId ?? null, { onSettled });
  const progressQuery = useEditionProgress(edition.id, isActive);
  const samples = useSamples(job);
  const now = useNow();
  const [stopping, setStopping] = useState(false);

  if (!job) return <p className="text-sm text-muted-foreground">Loading the job…</p>;

  const info = parseStage(job.stage, job.status);
  const progress = Math.max(0, Math.min(100, Math.round(job.progress)));
  const chapters = progressQuery.data?.chapters ?? [];
  const factcheck = progressQuery.data?.factcheck;
  const left = info.paused ? null : remainingMs(samples);
  const running = runningMs(job, now);
  const queuedFor = job.status === "queued" ? now - new Date(job.createdAt).getTime() : 0;
  const written = progressQuery.data?.writtenWords ?? 0;
  const total = progressQuery.data?.totalWords ?? 0;

  return (
    <div className="space-y-3" data-testid="edition-progress">
      <Steps info={info} factcheck={factcheck} />

      <div>
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          <span className="truncate text-sm font-medium">{info.label}</span>
          <span className="text-sm font-semibold tabular-nums">{progress}%</span>
        </div>
        <div
          className="h-3 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label="Edition progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <div
            className={cn(
              "h-full rounded-full transition-all duration-700",
              info.paused ? "bg-amber-500" : "bg-primary",
              job.status === "running" && "animate-pulse"
            )}
            style={{ width: `${Math.max(2, progress)}%` }}
          />
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground" data-testid="edition-timing">
          {running !== null ? `Running for ${formatDuration(running)}` : "Not started yet"}
          {job.status === "running" && (left !== null ? ` · about ${formatDuration(left)} left` : " · estimating the time left…")}
          {total > 0 && info.phase === "writing" ? ` · ${written.toLocaleString()} of ${total.toLocaleString()} words written` : ""}
        </p>
      </div>

      {info.paused && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm" role="status">
          <p className="font-medium text-amber-700 dark:text-amber-400">Paused: the LLM host does not answer</p>
          <p className="mt-1 text-muted-foreground">
            Start Ollama on the Mac (and keep it awake). The edition continues by itself; finished chapters are kept.
          </p>
          {job.waitReason && <p className="mt-1 text-xs text-muted-foreground">{job.waitReason}</p>}
        </div>
      )}

      {queuedFor > QUEUED_HINT_MS && (
        <p className="rounded-lg border p-3 text-sm text-muted-foreground" role="status">
          No worker has picked it up yet. If this stays so, check that the workers service runs and listens to the
          reader queues (WORKER_QUEUES=reader,reader_fast).
        </p>
      )}

      {chapters.length > 0 && (
        <details open className="rounded-lg border p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Chapters: {chapters.filter((c) => !c.divider && c.state !== "pending").length} of{" "}
            {chapters.filter((c) => !c.divider).length} written
          </summary>
          <div className="mt-2">
            <ChapterList chapters={chapters} info={info} factcheck={factcheck} />
          </div>
        </details>
      )}

      {isActive && (
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            disabled={stopping}
            onClick={async () => {
              setStopping(true);
              try {
                await cancel();
              } finally {
                setStopping(false);
              }
            }}
          >
            <Ban className="h-3.5 w-3.5" /> Stop
          </Button>
          <span className="text-xs text-muted-foreground">Stopping keeps the finished chapters; Continue picks up from there.</span>
        </div>
      )}
    </div>
  );
}
