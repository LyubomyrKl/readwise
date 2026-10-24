"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  ChevronUp,
  ChevronDown,
  X,
  CheckCircle,
  AlertCircle,
  FileText,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useUpload } from "@tools/reader/documents/upload/UploadProvider";
import { cn } from "@/lib/utils";

export function UploadWidget() {
  const { uploads, removeUpload, clearCompleted, hasActiveUploads } = useUpload();
  const [isExpanded, setIsExpanded] = useState(false);

  // Don't show widget if no uploads
  if (uploads.length === 0) return null;

  const activeUploads = uploads.filter(
    (upload) => upload.status === "uploading" || upload.status === "processing"
  );
  const completedUploads = uploads.filter((upload) => upload.status === "completed");
  const errorUploads = uploads.filter((upload) => upload.status === "error");

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <FileText className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusText = (upload: any) => {
    switch (upload.status) {
      case "uploading":
        return "Uploading...";
      case "processing":
        return "Processing...";
      case "completed":
        return "Successfully uploaded!";
      case "error":
        return upload.error || "Error";
      default:
        return "Pending";
    }
  };

  const getOverallProgress = () => {
    if (uploads.length === 0) return 0;
    const totalProgress = uploads.reduce((sum, upload) => {
      return sum + (upload.status === "completed" ? 100 : upload.progress);
    }, 0);
    return Math.round(totalProgress / uploads.length);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: 100, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 100, scale: 0.9 }}
          className="bg-background border shadow-lg rounded-lg overflow-hidden max-w-sm"
        >
          {/* Header */}
          <div
            className={cn(
              "flex items-center justify-between p-3 cursor-pointer border-b",
              hasActiveUploads && "bg-primary/5"
            )}
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <div className="flex items-center gap-3">
              <div className="relative">
                <Upload className="h-5 w-5" />
                {hasActiveUploads && (
                  <div className="absolute -top-1 -right-1 h-3 w-3 bg-primary rounded-full animate-pulse" />
                )}
              </div>
              <div>
                <h3 className="font-medium text-sm">
                  {hasActiveUploads ? "Uploading" : "Uploads"} ({uploads.length})
                </h3>
                {hasActiveUploads && (
                  <p className="text-xs text-muted-foreground">
                    {getOverallProgress()}% complete
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {completedUploads.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    clearCompleted();
                  }}
                  className="h-6 w-6 p-0"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronUp className="h-4 w-4" />
              )}
            </div>
          </div>

          {/* Overall Progress Bar */}
          {hasActiveUploads && (
            <div className="px-3 pb-2">
              <Progress value={getOverallProgress()} className="h-1" />
            </div>
          )}

          {/* Expanded Content */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="max-h-80 overflow-y-auto">
                  {uploads.map((upload) => (
                    <div
                      key={upload.id}
                      className="p-3 border-b last:border-b-0 hover:bg-muted/50"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 flex-1 min-w-0">
                          {upload.cover ? (
                            <div className="w-8 h-10 rounded border overflow-hidden shrink-0">
                              <img 
                                src={upload.cover} 
                                alt="Cover" 
                                className="w-full h-full object-cover"
                              />
                            </div>
                          ) : (
                            getStatusIcon(upload.status)
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {upload.title || upload.name}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {upload.author && `by ${upload.author} • `}
                              {(upload.size / 1024 / 1024).toFixed(1)} MB
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {getStatusText(upload)}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeUpload(upload.id)}
                          disabled={
                            upload.status === "uploading" ||
                            upload.status === "processing"
                          }
                          className="h-6 w-6 p-0 shrink-0"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>

                      {/* Individual Progress */}
                      {(upload.status === "uploading" ||
                        upload.status === "processing") && (
                        <div className="mt-2">
                          <div className="flex justify-between text-xs mb-1">
                            <span>{upload.progress}%</span>
                          </div>
                          <Progress value={upload.progress} className="h-1" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Footer Actions */}
                <div className="p-3 bg-muted/30 border-t">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>
                      {completedUploads.length} completed
                      {errorUploads.length > 0 && `, ${errorUploads.length} failed`}
                    </span>
                    {activeUploads.length > 0 && (
                      <span>{activeUploads.length} uploading</span>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}