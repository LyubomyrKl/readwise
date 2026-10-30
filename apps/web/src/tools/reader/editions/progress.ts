/**
 * What the abridge job's stage and error mean to a reader. The stage strings come from the worker
 * (apps/workers/worker/tools/reader/abridge/handler.py) and are matched here, in one place.
 */
import { formatDuration, type JobResponse, type JobStatus } from "@platform/jobs/types";

export type EditionPhase = "queued" | "reading" | "writing" | "checking" | "fixing" | "finishing" | "done";

/** The steps shown above the bar, in order. */
export const EDITION_STEPS: { phase: EditionPhase; label: string }[] = [
  { phase: "reading", label: "Reading" },
  { phase: "writing", label: "Writing" },
  { phase: "checking", label: "Fact-checking" },
  { phase: "fixing", label: "Correcting" },
  { phase: "finishing", label: "Finishing" },
];

export interface StageInfo {
  phase: EditionPhase;
  /** the job waits for the LLM host; `phase` is where it stopped */
  paused?: boolean;
  /** a sentence for the reader: "Writing chapter 3 of 12 (part 2 of 4)" */
  label: string;
  chapter?: number;
  chapters?: number;
  part?: number;
  parts?: number;
}

const CHAPTER = /chapter (\d+) of (\d+)(?:: part (\d+) of (\d+))?/i;

export function parseStage(stage: string | null | undefined, status: JobStatus | undefined): StageInfo {
  if (status === "succeeded") return { phase: "done", label: "Done" };
  if (status === "queued") return { phase: "queued", label: "Waiting for the worker to pick it up" };
  const info = parseRunning((stage ?? "").trim());
  return status === "waiting" ? { ...info, paused: true, label: `Paused: ${info.label.charAt(0).toLowerCase()}${info.label.slice(1)}` } : info;
}

function parseRunning(text: string): StageInfo {
  const chapter = CHAPTER.exec(text);
  const numbers = chapter
    ? {
        chapter: Number(chapter[1]),
        chapters: Number(chapter[2]),
        part: chapter[3] ? Number(chapter[3]) : undefined,
        parts: chapter[4] ? Number(chapter[4]) : undefined,
      }
    : {};
  const where = chapter
    ? `chapter ${numbers.chapter} of ${numbers.chapters}${numbers.parts ? ` (part ${numbers.part} of ${numbers.parts})` : ""}`
    : "";
  if (/^fact-checking/i.test(text)) return { phase: "checking", label: `Fact-checking ${where}`.trim(), ...numbers };
  if (/^fixing/i.test(text)) return { phase: "fixing", label: `Correcting ${where}`.trim(), ...numbers };
  if (chapter) return { phase: "writing", label: `Writing ${where}`, ...numbers };
  if (/scanned page (\d+) of (\d+)/i.test(text)) {
    const [, page, pages] = /scanned page (\d+) of (\d+)/i.exec(text)!;
    return { phase: "reading", label: `Reading scanned page ${page} of ${pages}` };
  }
  if (/overview/i.test(text)) return { phase: "finishing", label: "Writing the book overview" };
  if (/epub|already made/i.test(text)) return { phase: "finishing", label: "Building the EPUB" };
  return { phase: "reading", label: "Reading the book" };
}

export { formatDuration };

export interface Sample {
  at: number;
  progress: number;
}

/**
 * Time left from the progress seen while the page is open: the job's start time does not help, because a
 * retried edition starts again at its last finished chapter. Needs a minute and two points of progress.
 */
export function remainingMs(samples: Sample[]): number | null {
  if (samples.length < 2) return null;
  const first = samples[0];
  const last = samples[samples.length - 1];
  const gained = last.progress - first.progress;
  const elapsed = last.at - first.at;
  if (gained < 2 || elapsed < 60_000 || last.progress >= 100) return null;
  return ((100 - last.progress) * elapsed) / gained;
}

/** Time the job has been running, from its (latest) start. */
export function runningMs(job: Pick<JobResponse, "startedAt">, now: number): number | null {
  if (!job.startedAt) return null;
  const started = new Date(job.startedAt).getTime();
  return Number.isFinite(started) && now >= started ? now - started : null;
}

export interface EditionError {
  title: string;
  /** what happened and what to do, in a sentence or two */
  hint: string;
  /** a command to run on the Mac, shown with a copy button */
  command?: string;
  /** retrying the same job can help (it continues from the last finished chapter) */
  canContinue: boolean;
}

/** A failed or cancelled edition, explained. The raw error stays available under "Details". */
export function describeEditionError(error: string | null | undefined, status?: JobStatus): EditionError {
  const text = error ?? "";
  const pull = /ollama pull ([^\s)]+)/.exec(text);
  if (/not on the LLM host|is not available on the LLM host/i.test(text)) {
    return {
      title: "A model is missing on the Mac",
      hint: "Pull it in a terminal on the Mac, then press Continue.",
      command: pull ? `ollama pull ${pull[1]}` : undefined,
      canContinue: true,
    };
  }
  if (/no model configured/i.test(text)) {
    return {
      title: "No model is set for editions",
      hint: "Set ABRIDGE_MODEL (or OLLAMA_MODEL) in the server's .env, restart the workers, then press Continue.",
      canContinue: true,
    };
  }
  if (/no text to abridge/i.test(text)) {
    return {
      title: "This book has no readable text",
      hint: "No chapter had text to abridge. If it is a scanned PDF, the pages are read by the vision model only when OCR is on (ABRIDGE_OCR).",
      canContinue: false,
    };
  }
  if (/unsupported file type/i.test(text)) {
    return { title: "This kind of file cannot be abridged", hint: "Editions are made from EPUB and PDF files.", canContinue: false };
  }
  if (/BadZipFile|not a zip|without a package document|FileDataError|cannot open broken|damaged|no such file/i.test(text)) {
    return {
      title: "The file could not be read",
      hint: "It looks damaged or is not a real EPUB or PDF. Upload it again, or another copy of the book.",
      canContinue: false,
    };
  }
  if (/worker lost|interrupted: the worker stopped/i.test(text)) {
    return {
      title: "The worker stopped while making it",
      hint: "This happens when the workers restart. Continue picks up at the last finished chapter.",
      canContinue: true,
    };
  }
  if (/LLM error|LLM host answered|no answer within/i.test(text)) {
    return {
      title: "The LLM host answered with errors",
      hint: "Check that Ollama runs on the Mac and has memory free (one model loaded at a time), then press Continue.",
      canContinue: true,
    };
  }
  if (status === "cancelled" || /cancel/i.test(text)) {
    return { title: "Stopped", hint: "Continue picks up at the last finished chapter.", canContinue: true };
  }
  return {
    title: "The edition stopped with an error",
    hint: "Continue tries again from the last finished chapter; the details below say what went wrong.",
    canContinue: true,
  };
}
