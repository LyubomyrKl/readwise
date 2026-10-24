"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  ChevronUp,
  ChevronDown,
  X,
  CheckCircle2,
  AlertCircle,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  Minimize2,
  Maximize2,
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
import { UploadQueueCompact } from "./UploadQueue";
import { UploadProgress, UploadStats } from "@tools/reader/documents/upload/UploadProvider/types";

interface UploadWidgetEnhancedProps {
  uploads: UploadProgress[];
  stats: UploadStats;
  isPaused: boolean;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  onPauseAll: () => void;
  onResumeAll: () => void;
  onCancelAll: () => void;
  onClearCompleted: () => void;
}

// Format bytes
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

// Format time
function formatTime(seconds: number): string {
  if (!seconds || seconds <= 0 || !isFinite(seconds)) return "";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}

export function UploadWidgetEnhanced({
  uploads,
  stats,
  isPaused,
  onRemove,
  onRetry,
  onPauseAll,
  onResumeAll,
  onCancelAll,
  onClearCompleted,
}: UploadWidgetEnhancedProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  // Don't show if no uploads
  if (uploads.length === 0) return null;

  const hasActiveUploads = stats.uploading > 0;
  const allCompleted = stats.completed === stats.total && stats.total > 0;
  const hasFailedUploads = stats.failed > 0;

  // Minimized view - just a small pill
  if (isMinimized) {
    return (
      <TooltipProvider>
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="fixed bottom-6 right-6 z-50"
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setIsMinimized(false)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-full shadow-lg border transition-colors",
                  "bg-background hover:bg-muted",
                  hasActiveUploads && "ring-2 ring-primary/50"
                )}
              >
                {hasActiveUploads ? (
                  <>
                    <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                    <span className="text-sm font-medium tabular-nums">
                      {stats.overallProgress}%
                    </span>
                  </>
                ) : allCompleted ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    <span className="text-sm font-medium">{stats.completed}</span>
                  </>
                ) : hasFailedUploads ? (
                  <>
                    <AlertCircle className="h-4 w-4 text-destructive" />
                    <span className="text-sm font-medium">{stats.failed}</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    <span className="text-sm font-medium">{stats.total}</span>
                  </>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="left">
              {hasActiveUploads
                ? `Uploading ${stats.uploading} of ${stats.total}`
                : allCompleted
                ? `${stats.completed} uploads complete`
                : `${stats.total} uploads`}
            </TooltipContent>
          </Tooltip>
        </motion.div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <motion.div
        initial={{ opacity: 0, y: 100, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 100, scale: 0.95 }}
        className="fixed bottom-6 right-6 z-50 w-80 max-w-[calc(100vw-3rem)]"
      >
        <div className="bg-background border shadow-xl rounded-xl overflow-hidden">
          {/* Header */}
          <div
            className={cn(
              "flex items-center justify-between p-3 cursor-pointer transition-colors",
              hasActiveUploads ? "bg-primary/5" : "hover:bg-muted/50"
            )}
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <div className="flex items-center gap-3 min-w-0">
              {/* Status indicator */}
              <div className="relative shrink-0">
                {hasActiveUploads ? (
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                  </div>
                ) : allCompleted ? (
                  <div className="h-8 w-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  </div>
                ) : hasFailedUploads ? (
                  <div className="h-8 w-8 rounded-full bg-destructive/10 flex items-center justify-center">
                    <AlertCircle className="h-4 w-4 text-destructive" />
                  </div>
                ) : (
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                    <Upload className="h-4 w-4" />
                  </div>
                )}
              </div>

              {/* Title and subtitle */}
              <div className="min-w-0">
                <h3 className="text-sm font-medium truncate">
                  {hasActiveUploads
                    ? `Uploading ${stats.uploading} of ${stats.total}`
                    : allCompleted
                    ? "Uploads complete"
                    : hasFailedUploads
                    ? `${stats.failed} upload${stats.failed !== 1 ? "s" : ""} failed`
                    : `${stats.total} upload${stats.total !== 1 ? "s" : ""}`}
                </h3>
                {hasActiveUploads && (
                  <p className="text-xs text-muted-foreground truncate">
                    {formatBytes(stats.uploadedBytes)} of{" "}
                    {formatBytes(stats.totalBytes)}
                    {stats.estimatedTimeRemaining > 0 &&
                      ` · ${formatTime(stats.estimatedTimeRemaining)} left`}
                  </p>
                )}
              </div>
            </div>

            {/* Header actions */}
            <div className="flex items-center gap-1 shrink-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsMinimized(true);
                    }}
                  >
                    <Minimize2 className="h-3.5 w-3.5" />
                    <span className="sr-only">Minimize</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Minimize</TooltipContent>
              </Tooltip>

              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </div>

          {/* Progress bar */}
          {hasActiveUploads && (
            <div className="px-3 pb-2">
              <Progress value={stats.overallProgress} className="h-1" />
            </div>
          )}

          {/* Expanded content */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden border-t"
              >
                {/* Compact file list */}
                <div className="p-3 max-h-60 overflow-y-auto">
                  <UploadQueueCompact
                    uploads={uploads}
                    stats={stats}
                    onRemove={onRemove}
                    onRetry={onRetry}
                    maxItems={8}
                  />
                </div>

                {/* Footer actions */}
                <div className="px-3 py-2 bg-muted/30 border-t flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">
                    {stats.completed > 0 && (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        {stats.completed} done
                      </span>
                    )}
                    {stats.completed > 0 && stats.failed > 0 && " · "}
                    {stats.failed > 0 && (
                      <span className="text-destructive">
                        {stats.failed} failed
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    {/* Pause/Resume */}
                    {hasActiveUploads && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={isPaused ? onResumeAll : onPauseAll}
                          >
                            {isPaused ? (
                              <Play className="h-3.5 w-3.5" />
                            ) : (
                              <Pause className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {isPaused ? "Resume" : "Pause"}
                        </TooltipContent>
                      </Tooltip>
                    )}

                    {/* Retry failed */}
                    {hasFailedUploads && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => {
                              uploads
                                .filter((u) => u.status === "error")
                                .forEach((u) => onRetry(u.id));
                            }}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Retry failed</TooltipContent>
                      </Tooltip>
                    )}

                    {/* Clear completed */}
                    {stats.completed > 0 && !hasActiveUploads && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={onClearCompleted}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Clear completed</TooltipContent>
                      </Tooltip>
                    )}

                    {/* Cancel all */}
                    {hasActiveUploads && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                            onClick={onCancelAll}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Cancel all</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </TooltipProvider>
  );
}
