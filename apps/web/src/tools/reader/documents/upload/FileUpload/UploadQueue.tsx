"use client";

import React, { useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { UploadQueueItem } from "./UploadQueueItem";
import { UploadQueueHeader } from "./UploadQueueHeader";
import { UploadProgress, UploadStats } from "@tools/reader/documents/upload/UploadProvider/types";

interface UploadQueueProps {
  uploads: UploadProgress[];
  stats: UploadStats;
  isPaused: boolean;
  onCancel: (id: string) => void;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onPauseAll: () => void;
  onResumeAll: () => void;
  onCancelAll: () => void;
  onRetryFailed: () => void;
  onClearCompleted: () => void;
  maxVisibleItems?: number;
  className?: string;
}

// Sort uploads: active first, then queued, paused, errors, completed
function sortUploads(uploads: UploadProgress[]): UploadProgress[] {
  const statusOrder: Record<string, number> = {
    uploading: 0,
    processing: 1,
    queued: 2,
    paused: 3,
    error: 4,
    completed: 5,
  };

  return [...uploads].sort((a, b) => {
    const aOrder = statusOrder[a.status] ?? 99;
    const bOrder = statusOrder[b.status] ?? 99;
    if (aOrder !== bOrder) return aOrder - bOrder;
    // Secondary sort by queue position if available
    if (a.queuePosition !== undefined && b.queuePosition !== undefined) {
      return a.queuePosition - b.queuePosition;
    }
    return 0;
  });
}

export function UploadQueue({
  uploads,
  stats,
  isPaused,
  onCancel,
  onRemove,
  onRetry,
  onPause,
  onResume,
  onPauseAll,
  onResumeAll,
  onCancelAll,
  onRetryFailed,
  onClearCompleted,
  maxVisibleItems = 10,
  className,
}: UploadQueueProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // Sort uploads for display
  const sortedUploads = useMemo(() => sortUploads(uploads), [uploads]);

  // Calculate if we should use virtual scrolling
  const shouldVirtualize = uploads.length > maxVisibleItems;
  const itemHeight = 64; // Approximate height of each item
  const maxHeight = maxVisibleItems * itemHeight;

  if (uploads.length === 0) {
    return null;
  }

  return (
    <Card className={cn("overflow-hidden", className)}>
      {/* Header with batch controls */}
      <UploadQueueHeader
        stats={stats}
        isPaused={isPaused}
        onPauseAll={onPauseAll}
        onResumeAll={onResumeAll}
        onCancelAll={onCancelAll}
        onRetryFailed={onRetryFailed}
        onClearCompleted={onClearCompleted}
      />

      {/* Upload list */}
      <div
        ref={listRef}
        className={cn("overflow-y-auto", {
          "scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent":
            shouldVirtualize,
        })}
        style={{
          maxHeight: shouldVirtualize ? `${maxHeight}px` : undefined,
        }}
        role="list"
        aria-label="Upload queue"
      >
        <AnimatePresence initial={false}>
          {sortedUploads.map((upload) => (
            <UploadQueueItem
              key={upload.id}
              upload={upload}
              onCancel={onCancel}
              onRemove={onRemove}
              onRetry={onRetry}
              onPause={onPause}
              onResume={onResume}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Show more indicator */}
      {shouldVirtualize && (
        <div className="px-4 py-2 bg-muted/30 border-t text-center">
          <p className="text-xs text-muted-foreground">
            Showing {Math.min(uploads.length, maxVisibleItems)} of{" "}
            {uploads.length} files · Scroll to see more
          </p>
        </div>
      )}
    </Card>
  );
}

// Compact version for sidebar/widget
export function UploadQueueCompact({
  uploads,
  stats,
  onRemove,
  onRetry,
  maxItems = 5,
  className,
}: {
  uploads: UploadProgress[];
  stats: UploadStats;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  maxItems?: number;
  className?: string;
}) {
  const sortedUploads = useMemo(() => sortUploads(uploads), [uploads]);
  const visibleUploads = sortedUploads.slice(0, maxItems);
  const hiddenCount = uploads.length - maxItems;

  if (uploads.length === 0) return null;

  return (
    <div className={cn("space-y-2", className)}>
      {/* Mini progress summary */}
      {stats.uploading > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="h-3 w-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <span>
            {stats.completed} of {stats.total} · {stats.overallProgress}%
          </span>
        </div>
      )}

      {/* Compact list */}
      <div className="space-y-1">
        {visibleUploads.map((upload) => (
          <motion.div
            key={upload.id}
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center gap-2 text-sm"
          >
            {/* Status indicator */}
            <div
              className={cn("h-2 w-2 rounded-full shrink-0", {
                "bg-primary animate-pulse":
                  upload.status === "uploading" ||
                  upload.status === "processing",
                "bg-emerald-500": upload.status === "completed",
                "bg-destructive": upload.status === "error",
                "bg-amber-500": upload.status === "paused",
                "bg-muted-foreground/30": upload.status === "queued",
              })}
            />

            {/* File name */}
            <span className="truncate flex-1">{upload.title || upload.name}</span>

            {/* Progress or action */}
            {upload.status === "uploading" && (
              <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                {Math.round(upload.progress)}%
              </span>
            )}
            {upload.status === "error" && (
              <button
                onClick={() => onRetry(upload.id)}
                className="text-xs text-primary hover:underline shrink-0"
              >
                Retry
              </button>
            )}
            {upload.status === "completed" && (
              <button
                onClick={() => onRemove(upload.id)}
                className="text-xs text-muted-foreground hover:text-foreground shrink-0"
              >
                ×
              </button>
            )}
          </motion.div>
        ))}
      </div>

      {/* Hidden count */}
      {hiddenCount > 0 && (
        <p className="text-xs text-muted-foreground">
          +{hiddenCount} more file{hiddenCount !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}
