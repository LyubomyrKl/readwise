"use client";

import { AlertTriangle, Copy, RotateCcw, Scissors } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { EditionResponse } from "@tools/reader/types";
import { describeEditionError } from "./progress";

interface EditionErrorProps {
  edition: EditionResponse;
  busy?: boolean;
  /** retry the same job: it continues from the last finished chapter */
  onContinue: () => void;
  /** a new edition with the same settings, from the first chapter */
  onStartOver: () => void;
}

/** Why an edition stopped, in plain words, what to do about it, and the raw error under Details. */
export function EditionError({ edition, busy, onContinue, onStartOver }: EditionErrorProps) {
  const job = edition.job;
  const error = describeEditionError(job?.error, job?.status);

  const copy = async (command: string) => {
    try {
      await navigator.clipboard.writeText(command);
      toast.success("Copied");
    } catch {
      toast.error("Could not copy; select the command instead");
    }
  };

  return (
    <div role="alert" className="mb-6 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm" data-testid="edition-error">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <div className="min-w-0">
          <p className="font-semibold">{error.title}</p>
          <p className="mt-1 text-muted-foreground">{error.hint}</p>
        </div>
      </div>

      {error.command && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-muted px-3 py-2 font-mono text-xs">
          <code className="min-w-0 flex-1 select-all break-all">{error.command}</code>
          <Button size="sm" variant="ghost" onClick={() => void copy(error.command!)} aria-label="Copy the command">
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {job?.error && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-muted-foreground">Details</summary>
          <pre className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">{job.error}</pre>
        </details>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {error.canContinue && (
          <Button size="sm" disabled={busy} onClick={onContinue}>
            <RotateCcw className="h-3.5 w-3.5" /> Continue
          </Button>
        )}
        <Button size="sm" variant="outline" disabled={busy} onClick={onStartOver}>
          <Scissors className="h-3.5 w-3.5" /> Start over
        </Button>
      </div>
    </div>
  );
}
