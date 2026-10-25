"use client";

import React, { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { AlertCircle, Brain } from "lucide-react";
import { useJob } from "@platform/jobs/useJob";
import { JobProgress } from "@platform/jobs/JobProgress";
import type { JobResponse } from "@platform/jobs/types";

interface ProcessingProps {
  /** the reader.summarize job */
  jobId: string;
  /** the reader.extract job it waits for, when the text had to be extracted first */
  parentJobId?: string | null;
  /** called once when the job ends, with its terminal state */
  onSettled: (job: JobResponse) => void;
}

/** Live progress of a summary job: real stages, the waiting hint, cancel. */
export const Processing = ({ jobId, parentJobId, onSettled }: ProcessingProps) => {
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;
  const { job, cancel, isActive } = useJob(jobId, { onSettled: (j) => onSettledRef.current(j) });
  const parent = useJob(parentJobId ?? null);
  const failed = job?.status === "failed" || job?.status === "cancelled";

  useEffect(() => {
    document.title = job?.stage ? `${job.progress}% · ${job.stage}` : "Creating your summary";
  }, [job?.stage, job?.progress]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-8">
      <div className="max-w-md w-full">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center">
          <motion.div
            className="relative w-28 h-28 mx-auto mb-8"
            animate={{ rotate: isActive ? 360 : 0 }}
            transition={{ duration: 20, repeat: isActive ? Infinity : 0, ease: "linear" }}
          >
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/30 to-primary/5" />
            <div className="absolute inset-0 flex items-center justify-center">
              <motion.div
                animate={{ rotate: isActive ? -360 : 0 }}
                transition={{ duration: 20, repeat: isActive ? Infinity : 0, ease: "linear" }}
              >
                {failed ? <AlertCircle className="w-10 h-10 text-destructive" /> : <Brain className="w-10 h-10 text-primary" />}
              </motion.div>
            </div>
          </motion.div>

          <h2 className="text-2xl font-bold mb-3">
            {failed ? "Generation did not finish" : "Creating your summary"}
          </h2>
          <p className="text-muted-foreground mb-6 leading-relaxed">
            {failed
              ? "The job stopped. You can retry it or start a new one with other settings."
              : "The text is extracted once, then summarised section by section. A whole book can take hours; you can leave and come back."}
          </p>

          {job ? (
            <JobProgress job={job} parent={parent.job} onCancel={isActive ? cancel : undefined} className="text-left" />
          ) : (
            <p className="text-sm text-muted-foreground">Loading job…</p>
          )}
        </motion.div>
      </div>
    </div>
  );
};
