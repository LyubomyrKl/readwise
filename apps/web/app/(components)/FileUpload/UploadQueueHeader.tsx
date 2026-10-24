"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Pause,
  Play,
  X,
  RotateCcw,
  Trash2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { UploadStats } from "@/app/(providers)/UploadProvider/types";

interface UploadQueueHeaderProps {
  stats: UploadStats;
  isPaused: boolean;
  onPauseAll: () => void;
  onResumeAll: () => void;
  onCancelAll: () => void;
  onRetryFailed: () => void;
  onClearCompleted: () => void;
  className?: string;
}

// Format bytes to human readable
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

// Format seconds to human readable
function formatTime(seconds: number): string {
  if (!seconds || seconds <= 0 || !isFinite(seconds)) return "";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${Math.round(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`;
}

export function UploadQueueHeader({
  stats,
  isPaused,
  onPauseAll,
  onResumeAll,
  onCancelAll,
  onRetryFailed,
  onClearCompleted,
  className,
}: UploadQueueHeaderProps) {
  const hasActiveUploads = stats.uploading > 0;
  const hasFailedUploads = stats.failed > 0;
  const hasCompletedUploads = stats.completed > 0;
  const hasPausedUploads = stats.paused > 0;
  const hasQueuedUploads = stats.queued > 0;
  const allCompleted = stats.completed === stats.total && stats.total > 0;
  const hasInProgress =
    hasActiveUploads || hasQueuedUploads || hasPausedUploads;

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={cn(
          "sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b px-4 py-3",
          className
        )}
      >
        {/* Main header row */}
        <div className="flex items-center justify-between gap-4">
          {/* Left: Title and count */}
          <div className="flex items-center gap-3 min-w-0">
            <AnimatePresence mode="wait">
              {allCompleted ? (
                <motion.div
                  key="completed"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                >
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                </motion.div>
              ) : hasFailedUploads && !hasActiveUploads ? (
                <motion.div
                  key="failed"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                >
                  <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
                </motion.div>
              ) : hasActiveUploads ? (
                <motion.div
                  key="active"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="relative"
                >
                  <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                </motion.div>
              ) : null}
            </AnimatePresence>

            <div className="min-w-0">
              <h3 className="text-sm font-medium truncate">
                {allCompleted
                  ? `${stats.total} file${stats.total !== 1 ? "s" : ""} uploaded`
                  : hasActiveUploads
                  ? `Uploading ${stats.uploading} of ${stats.total} file${stats.total !== 1 ? "s" : ""}`
                  : isPaused || hasPausedUploads
                  ? "Upload paused"
                  : hasFailedUploads
                  ? `${stats.failed} upload${stats.failed !== 1 ? "s" : ""} failed`
                  : `${stats.total} file${stats.total !== 1 ? "s" : ""}`}
              </h3>

              {/* Secondary info */}
              {hasActiveUploads && (
                <p className="text-xs text-muted-foreground">
                  {formatBytes(stats.uploadedBytes)} of{" "}
                  {formatBytes(stats.totalBytes)}
                  {stats.averageSpeed > 0 && (
                    <> · {formatBytes(stats.averageSpeed)}/s</>
                  )}
                  {stats.estimatedTimeRemaining > 0 && (
                    <> · {formatTime(stats.estimatedTimeRemaining)} left</>
                  )}
                </p>
              )}
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Pause/Resume all */}
            {hasInProgress && (
              <>
                {isPaused || hasPausedUploads ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2"
                        onClick={onResumeAll}
                      >
                        <Play className="h-4 w-4 mr-1" />
                        Resume
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Resume all uploads</TooltipContent>
                  </Tooltip>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2"
                        onClick={onPauseAll}
                      >
                        <Pause className="h-4 w-4 mr-1" />
                        Pause
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Pause all uploads</TooltipContent>
                  </Tooltip>
                )}
              </>
            )}

            {/* Retry failed */}
            {hasFailedUploads && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2"
                    onClick={onRetryFailed}
                  >
                    <RotateCcw className="h-4 w-4 mr-1" />
                    Retry ({stats.failed})
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Retry all failed uploads</TooltipContent>
              </Tooltip>
            )}

            {/* Clear completed */}
            {hasCompletedUploads && !hasActiveUploads && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={onClearCompleted}
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Clear completed</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Clear completed uploads</TooltipContent>
              </Tooltip>
            )}

            {/* Cancel all */}
            {hasInProgress && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    onClick={onCancelAll}
                  >
                    <X className="h-4 w-4" />
                    <span className="sr-only">Cancel all</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Cancel all uploads</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {(hasActiveUploads || hasPausedUploads) && (
          <div className="mt-3">
            <Progress
              value={stats.overallProgress}
              className={cn("h-1.5", {
                "opacity-50": isPaused || hasPausedUploads,
              })}
              aria-label={`Overall upload progress: ${stats.overallProgress}%`}
            />
            <div className="flex justify-between mt-1.5 text-xs text-muted-foreground">
              <span>
                {stats.completed} of {stats.total} completed
              </span>
              <span className="tabular-nums">{stats.overallProgress}%</span>
            </div>
          </div>
        )}

        {/* Summary badges for completed state */}
        {allCompleted && hasFailedUploads && (
          <div className="flex items-center gap-2 mt-2 text-xs">
            <span className="text-emerald-600 dark:text-emerald-400">
              {stats.completed} succeeded
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="text-destructive">{stats.failed} failed</span>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
