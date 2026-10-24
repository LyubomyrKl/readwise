"use client";

import React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { X, AlertTriangle } from "lucide-react";
import { UploadStats } from "@tools/reader/documents/upload/UploadProvider/types";

interface CancelConfirmDialogProps {
  stats: UploadStats;
  onConfirm: () => void;
  trigger?: React.ReactNode;
  children?: React.ReactNode;
}

export function CancelConfirmDialog({
  stats,
  onConfirm,
  trigger,
  children,
}: CancelConfirmDialogProps) {
  const pendingCount = stats.queued + stats.uploading + stats.paused;
  const completedCount = stats.completed;

  // Don't show confirmation for small batches
  if (pendingCount <= 3) {
    return (
      <span onClick={onConfirm} className="contents">
        {trigger || children}
      </span>
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {trigger || children || (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <AlertDialogTitle>Cancel {pendingCount} uploads?</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="pt-2">
            {completedCount > 0 ? (
              <>
                This will cancel {pendingCount} pending upload
                {pendingCount !== 1 ? "s" : ""}.{" "}
                <span className="text-foreground">
                  {completedCount} file{completedCount !== 1 ? "s" : ""} already
                  completed will remain in your library.
                </span>
              </>
            ) : (
              <>
                This will cancel all {pendingCount} pending upload
                {pendingCount !== 1 ? "s" : ""}. This action cannot be undone.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep uploading</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Cancel uploads
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Simpler version for clearing completed uploads
interface ClearConfirmDialogProps {
  count: number;
  onConfirm: () => void;
  trigger?: React.ReactNode;
}

export function ClearConfirmDialog({
  count,
  onConfirm,
  trigger,
}: ClearConfirmDialogProps) {
  // Don't show confirmation for small numbers
  if (count <= 5) {
    return (
      <span onClick={onConfirm} className="contents">
        {trigger}
      </span>
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Clear {count} completed uploads?</AlertDialogTitle>
          <AlertDialogDescription>
            This will remove {count} completed upload{count !== 1 ? "s" : ""}{" "}
            from this view. Your files will remain in your library.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep in list</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Clear all</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
