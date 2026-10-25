"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { BookOpen, Sparkles, Brain, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { apiFetch } from "@/lib/fetcher";
import type { SummaryStatusResponse } from "@/lib/types";

type BookStatus = SummaryStatusResponse["status"];

interface ProcessingProps {
  bookId: string;
  onComplete: () => void;
  onError?: (error: string) => void;
}

const POLL_INTERVAL = 3000;

const steps = [
  { icon: BookOpen, label: "Reading content", key: "reading" },
  { icon: Brain, label: "Analyzing structure", key: "analyzing" },
  { icon: Sparkles, label: "Generating insights", key: "generating" },
  { icon: FileText, label: "Creating summary", key: "creating" },
];

export const Processing = ({ bookId, onComplete, onError }: ProcessingProps) => {
  const [status, setStatus] = useState<BookStatus>("processing");
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  // Real pipeline state reported by the job (stage such as "section 3/12", or why it waits).
  const [stage, setStage] = useState<string | null>(null);
  const [waitReason, setWaitReason] = useState<string | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const pollStatus = useCallback(async () => {
    try {
      const data = await apiFetch("GET", "/api/summarizer/status/[bookId]", undefined, { bookId });
      setStatus(data.status);
      setStage(data.stage ?? null);
      setWaitReason(data.jobStatus === "waiting" ? (data.waitReason ?? "Waiting") : null);
      if (typeof data.progress === "number" && data.progress > 0) {
        // never show 100% before the summary is actually there
        setProgress((prev) => Math.max(prev, Math.min(99, data.progress as number)));
      }

      if (data.isReady) {
        setProgress(100);
        setCurrentStep(steps.length);
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
        }
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
        }
        setTimeout(() => onComplete(), 500);
      } else if (data.status === "error") {
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
        }
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
        }
        onError?.("Summary generation failed. Please try again.");
      }
    } catch {
      // Continue polling on error - it might be a temporary network issue
    }
  }, [bookId, onComplete, onError]);

  useEffect(() => {
    // Start polling
    pollStatus();
    pollIntervalRef.current = setInterval(pollStatus, POLL_INTERVAL);

    // Simulate progress (will be overridden when complete)
    progressIntervalRef.current = setInterval(() => {
      setProgress((prev) => {
        // Slow down as we approach 90% (never reach 100% until actually done)
        if (prev >= 90) return prev;
        const increment = Math.max(0.5, (90 - prev) / 30);
        const newProgress = Math.min(90, prev + increment);

        // Update current step based on progress
        const stepProgress = newProgress / 100;
        const newStep = Math.min(
          Math.floor(stepProgress * steps.length),
          steps.length - 1
        );
        setCurrentStep(newStep);

        return newProgress;
      });
    }, 500);

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [pollStatus]);

  const getStepStatus = (index: number) => {
    if (status === "error") return "error";
    if (index < currentStep) return "completed";
    if (index === currentStep) return "active";
    return "pending";
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-8">
      <div className="max-w-md w-full">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          {/* Animated Icon */}
          <motion.div
            className="relative w-28 h-28 mx-auto mb-8"
            animate={{ rotate: status === "error" ? 0 : 360 }}
            transition={{ duration: 20, repeat: status === "error" ? 0 : Infinity, ease: "linear" }}
          >
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/30 to-primary/5" />
            <motion.div
              className="absolute inset-2 rounded-full bg-gradient-to-br from-primary/20 to-transparent"
              animate={{ scale: status === "error" ? 1 : [1, 1.1, 1] }}
              transition={{ duration: 2, repeat: status === "error" ? 0 : Infinity, ease: "easeInOut" }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <motion.div
                animate={{ rotate: status === "error" ? 0 : -360 }}
                transition={{ duration: 20, repeat: status === "error" ? 0 : Infinity, ease: "linear" }}
              >
                {status === "error" ? (
                  <AlertCircle className="w-10 h-10 text-destructive" />
                ) : (
                  <Brain className="w-10 h-10 text-primary" />
                )}
              </motion.div>
            </div>
            {/* Orbiting dots */}
            {status !== "error" && [0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="absolute w-3 h-3 rounded-full bg-primary"
                style={{
                  top: "50%",
                  left: "50%",
                  marginTop: -6,
                  marginLeft: -6,
                }}
                animate={{
                  x: [0, Math.cos((i * 2 * Math.PI) / 3) * 50],
                  y: [0, Math.sin((i * 2 * Math.PI) / 3) * 50],
                  opacity: [0.3, 1, 0.3],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  delay: i * 0.3,
                  ease: "easeInOut",
                }}
              />
            ))}
          </motion.div>

          <h2 className="text-2xl font-bold mb-3">
            {status === "error" ? "Generation Failed" : "Creating Your Summary"}
          </h2>
          <p className="text-muted-foreground mb-6 leading-relaxed">
            {status === "error"
              ? "Something went wrong. Please try again."
              : "Our AI is analyzing the book and generating a comprehensive summary tailored for you."}
          </p>

          {status !== "error" && (waitReason || stage) && (
            <p
              className={`mb-6 text-sm ${waitReason ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}
              data-testid="summary-stage"
            >
              {waitReason ? `Waiting: ${waitReason}` : stage}
            </p>
          )}

          {/* Progress Bar */}
          {status !== "error" && (
            <div className="mb-8">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-medium">{Math.round(progress)}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-primary rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                />
              </div>
            </div>
          )}

          {/* Processing Steps */}
          <div className="space-y-3 text-left mb-8">
            {steps.map((step, index) => {
              const stepStatus = getStepStatus(index);
              return (
                <motion.div
                  key={step.label}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.2 }}
                  className="flex items-center gap-3 p-3 rounded-lg bg-muted/30"
                >
                  <div
                    className={`p-2 rounded-lg ${
                      stepStatus === "completed"
                        ? "bg-green-500/10 text-green-500"
                        : stepStatus === "active"
                        ? "bg-primary/10 text-primary"
                        : stepStatus === "error"
                        ? "bg-destructive/10 text-destructive"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {stepStatus === "completed" ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <step.icon className="w-4 h-4" />
                    )}
                  </div>
                  <span
                    className={
                      stepStatus === "completed"
                        ? "text-green-500"
                        : stepStatus === "active"
                        ? "text-foreground"
                        : "text-muted-foreground"
                    }
                  >
                    {step.label}
                  </span>
                  {stepStatus === "active" && (
                    <motion.div
                      className="ml-auto flex gap-1"
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                      <div className="w-1.5 h-1.5 rounded-full bg-primary/60" />
                      <div className="w-1.5 h-1.5 rounded-full bg-primary/30" />
                    </motion.div>
                  )}
                </motion.div>
              );
            })}
          </div>

          <div className="text-sm text-muted-foreground">
            {status === "error"
              ? "Please go back and try generating again."
              : waitReason
                ? "The job resumes by itself once the LLM host is reachable. Feel free to come back later."
                : "A whole book can take hours. Feel free to wait or come back later."}
          </div>
        </motion.div>
      </div>
    </div>
  );
};
