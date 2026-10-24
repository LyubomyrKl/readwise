"use client";

import React, { memo } from "react";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  XCircle,
  Circle,
  Loader2,
  Pause,
  Play,
  X,
  RotateCcw,
  FileText,
  AlertTriangle,
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
import { UploadProgress, UploadStatus } from "@/app/(providers)/UploadProvider/types";

interface UploadQueueItemProps {
  upload: UploadProgress;
  onCancel: (id: string) => void;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  isCompact?: boolean;
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
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`;
}

// Get status icon based on upload status
function StatusIcon({ status }: { status: UploadStatus }) {
  switch (status) {
    case "queued":
      return (
        <Circle className="h-4 w-4 text-muted-foreground" strokeWidth={2} />
      );
    case "uploading":
    case "processing":
      return (
        <Loader2 className="h-4 w-4 text-primary animate-spin" strokeWidth={2} />
      );
    case "completed":
      return (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
        >
          <CheckCircle2 className="h-4 w-4 text-emerald-500" strokeWidth={2} />
        </motion.div>
      );
    case "error":
      return <XCircle className="h-4 w-4 text-destructive" strokeWidth={2} />;
    case "paused":
      return <Pause className="h-4 w-4 text-amber-500" strokeWidth={2} />;
    default:
      return <Circle className="h-4 w-4 text-muted-foreground" strokeWidth={2} />;
  }
}

// Get status text
function getStatusText(upload: UploadProgress): string {
  switch (upload.status) {
    case "queued":
      return "Queued";
    case "processing":
      return "Processing...";
    case "uploading":
      if (upload.speed && upload.speed > 0) {
        return `${formatBytes(upload.speed)}/s`;
      }
      return "Uploading...";
    case "completed":
      return "Done";
    case "error":
      return upload.error || "Failed";
    case "paused":
      return "Paused";
    default:
      return "";
  }
}

export const UploadQueueItem = memo(function UploadQueueItem({
  upload,
  onCancel,
  onRemove,
  onRetry,
  onPause,
  onResume,
  isCompact = false,
}: UploadQueueItemProps) {
  const isActive = upload.status === "uploading" || upload.status === "processing";
  const isCompleted = upload.status === "completed";
  const isError = upload.status === "error";
  const isPaused = upload.status === "paused";
  const isQueued = upload.status === "queued";

  return (
    <TooltipProvider delayDuration={300}>
      <motion.div
        layout
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: 0.2 }}
        className={cn(
          "group flex items-center gap-3 px-4 py-3 border-b last:border-b-0 transition-colors",
          "hover:bg-muted/50",
          {
            "bg-emerald-500/5": isCompleted,
            "bg-destructive/5": isError,
            "bg-amber-500/5": isPaused,
          }
        )}
        role="listitem"
        aria-label={`${upload.title || upload.name}, ${getStatusText(upload)}`}
      >
        {/* Status icon or cover preview */}
        <div className="shrink-0">
          {upload.cover ? (
            <div className="w-8 h-10 rounded border overflow-hidden bg-muted">
              <img
                src={upload.cover}
                alt=""
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
          ) : (
            <div className="w-8 h-10 rounded border flex items-center justify-center bg-muted/50">
              <FileText className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
        </div>

        {/* File info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <StatusIcon status={upload.status} />
            <p className="text-sm font-medium truncate" title={upload.title || upload.name}>
              {upload.title || upload.name}
            </p>
          </div>

          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-muted-foreground">
              {formatBytes(upload.size)}
            </span>
            <span className="text-xs text-muted-foreground">·</span>
            <span
              className={cn("text-xs", {
                "text-muted-foreground": isQueued || isActive,
                "text-emerald-600 dark:text-emerald-400": isCompleted,
                "text-destructive": isError,
                "text-amber-600 dark:text-amber-400": isPaused,
              })}
            >
              {getStatusText(upload)}
            </span>
            {isActive && upload.eta && upload.eta > 0 && (
              <>
                <span className="text-xs text-muted-foreground">·</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {formatTime(upload.eta)} left
                </span>
              </>
            )}
          </div>

          {/* Progress bar for active uploads */}
          {isActive && (
            <div className="mt-2">
              <Progress
                value={upload.progress}
                className="h-1"
                aria-label={`Upload progress: ${Math.round(upload.progress)}%`}
              />
            </div>
          )}

          {/* Error message */}
          {isError && upload.error && upload.errorCode !== "CANCELLED" && (
            <div className="flex items-center gap-1 mt-1">
              <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />
              <p className="text-xs text-destructive truncate" title={upload.error}>
                {upload.error}
              </p>
            </div>
          )}
        </div>

        {/* Progress percentage */}
        {isActive && (
          <span className="text-xs font-medium tabular-nums text-muted-foreground shrink-0">
            {Math.round(upload.progress)}%
          </span>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Pause/Resume for active uploads */}
          {isActive && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => onPause(upload.id)}
                >
                  <Pause className="h-3.5 w-3.5" />
                  <span className="sr-only">Pause</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Pause</TooltipContent>
            </Tooltip>
          )}

          {/* Resume for paused */}
          {isPaused && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => onResume(upload.id)}
                >
                  <Play className="h-3.5 w-3.5" />
                  <span className="sr-only">Resume</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Resume</TooltipContent>
            </Tooltip>
          )}

          {/* Retry for errors */}
          {isError && upload.errorCode !== "CANCELLED" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => onRetry(upload.id)}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span className="sr-only">Retry</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Retry</TooltipContent>
            </Tooltip>
          )}

          {/* Cancel for active/queued */}
          {(isActive || isQueued) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => onCancel(upload.id)}
                >
                  <X className="h-3.5 w-3.5" />
                  <span className="sr-only">Cancel</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Cancel</TooltipContent>
            </Tooltip>
          )}

          {/* Remove for completed/error/paused */}
          {(isCompleted || isError || isPaused) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => onRemove(upload.id)}
                >
                  <X className="h-3.5 w-3.5" />
                  <span className="sr-only">Remove</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Remove</TooltipContent>
            </Tooltip>
          )}
        </div>
      </motion.div>
    </TooltipProvider>
  );
});
