"use client";

import React, { useCallback, useState } from "react";
import { useDropzone, FileRejection } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileWarning, CheckCircle2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  MAX_FILE_SIZE,
  ALLOWED_EXTENSIONS,
} from "@/app/(providers)/UploadProvider/types";

interface FileDropZoneProps {
  onFilesAccepted: (files: File[]) => void;
  onFilesRejected?: (rejections: FileRejection[]) => void;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
}

type DropZoneState = "idle" | "drag-valid" | "drag-invalid" | "success";

export function FileDropZone({
  onFilesAccepted,
  onFilesRejected,
  disabled = false,
  compact = false,
  className,
}: FileDropZoneProps) {
  const [state, setState] = useState<DropZoneState>("idle");
  const [showSuccess, setShowSuccess] = useState(false);
  const [rejectionMessage, setRejectionMessage] = useState<string | null>(null);

  const onDrop = useCallback(
    (acceptedFiles: File[], rejections: FileRejection[]) => {
      if (acceptedFiles.length > 0) {
        onFilesAccepted(acceptedFiles);
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 1500);
      }

      if (rejections.length > 0) {
        onFilesRejected?.(rejections);
        const firstError = rejections[0]?.errors[0];
        if (firstError) {
          switch (firstError.code) {
            case "file-too-large":
              setRejectionMessage(
                `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`
              );
              break;
            case "file-invalid-type":
              setRejectionMessage("Invalid file type. Only PDF, EPUB, and TXT files are allowed");
              break;
            default:
              setRejectionMessage(firstError.message);
          }
          setTimeout(() => setRejectionMessage(null), 3000);
        }
      }

      setState("idle");
    },
    [onFilesAccepted, onFilesRejected]
  );

  const onDragEnter = useCallback(() => {
    setState("drag-valid");
  }, []);

  const onDragLeave = useCallback(() => {
    setState("idle");
  }, []);

  const { getRootProps, getInputProps, isDragActive, isDragReject } =
    useDropzone({
      onDrop,
      onDragEnter,
      onDragLeave,
      disabled,
      accept: {
        "application/pdf": [".pdf"],
        "application/epub+zip": [".epub"],
        "application/epub": [".epub"],
        "text/plain": [".txt"],
      },
      maxSize: MAX_FILE_SIZE,
      multiple: true,
      validator: (file) => {
        const fileName = file.name.toLowerCase();
        const hasValidExtension = ALLOWED_EXTENSIONS.some((ext) =>
          fileName.endsWith(ext)
        );
        if (!hasValidExtension) {
          return {
            code: "file-invalid-type",
            message: "Only PDF, EPUB, and TXT files are allowed",
          };
        }
        return null;
      },
    });

  const currentState: DropZoneState = disabled
    ? "idle"
    : isDragReject
    ? "drag-invalid"
    : isDragActive
    ? "drag-valid"
    : showSuccess
    ? "success"
    : "idle";

  return (
    <div
      {...getRootProps()}
      className={cn(
        "relative overflow-hidden rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        {
          // Idle state
          "border-muted-foreground/25 bg-muted/30 hover:border-primary/50 hover:bg-muted/50":
            currentState === "idle" && !disabled,
          // Drag valid state
          "border-primary bg-primary/5 scale-[1.01] shadow-lg":
            currentState === "drag-valid",
          // Drag invalid state
          "border-destructive bg-destructive/5": currentState === "drag-invalid",
          // Success state
          "border-emerald-500 bg-emerald-500/5": currentState === "success",
          // Disabled state
          "opacity-50 cursor-not-allowed": disabled,
        },
        compact ? "p-6" : "p-8 sm:p-12",
        className
      )}
      role="button"
      aria-label="Drop files or click to upload"
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
    >
      <input {...getInputProps()} aria-label="File input" />

      {/* Background pattern */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)`,
            backgroundSize: "24px 24px",
          }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10">
        <AnimatePresence mode="wait">
          {currentState === "drag-valid" && (
            <motion.div
              key="drag-valid"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="flex flex-col items-center text-center"
            >
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{
                  duration: 0.6,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                className={cn(
                  "rounded-full bg-primary/10 flex items-center justify-center mb-4",
                  compact ? "w-12 h-12" : "w-16 h-16"
                )}
              >
                <Upload
                  className={cn(
                    "text-primary",
                    compact ? "h-6 w-6" : "h-8 w-8"
                  )}
                />
              </motion.div>
              <p
                className={cn(
                  "font-semibold text-primary",
                  compact ? "text-base" : "text-lg"
                )}
              >
                Release to upload
              </p>
            </motion.div>
          )}

          {currentState === "drag-invalid" && (
            <motion.div
              key="drag-invalid"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="flex flex-col items-center text-center"
            >
              <div
                className={cn(
                  "rounded-full bg-destructive/10 flex items-center justify-center mb-4",
                  compact ? "w-12 h-12" : "w-16 h-16"
                )}
              >
                <FileWarning
                  className={cn(
                    "text-destructive",
                    compact ? "h-6 w-6" : "h-8 w-8"
                  )}
                />
              </div>
              <p
                className={cn(
                  "font-semibold text-destructive",
                  compact ? "text-base" : "text-lg"
                )}
              >
                File type not supported
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Only PDF, EPUB, and TXT files
              </p>
            </motion.div>
          )}

          {currentState === "success" && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="flex flex-col items-center text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className={cn(
                  "rounded-full bg-emerald-500/10 flex items-center justify-center mb-4",
                  compact ? "w-12 h-12" : "w-16 h-16"
                )}
              >
                <CheckCircle2
                  className={cn(
                    "text-emerald-500",
                    compact ? "h-6 w-6" : "h-8 w-8"
                  )}
                />
              </motion.div>
              <p
                className={cn(
                  "font-semibold text-emerald-600 dark:text-emerald-400",
                  compact ? "text-base" : "text-lg"
                )}
              >
                Files added
              </p>
            </motion.div>
          )}

          {currentState === "idle" && (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex flex-col items-center text-center"
            >
              <div
                className={cn(
                  "rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-4 transition-transform duration-200 group-hover:scale-110",
                  compact ? "w-12 h-12" : "w-16 h-16"
                )}
              >
                {compact ? (
                  <Plus
                    className={cn("text-primary", compact ? "h-6 w-6" : "h-8 w-8")}
                  />
                ) : (
                  <Upload
                    className={cn("text-primary", compact ? "h-6 w-6" : "h-8 w-8")}
                  />
                )}
              </div>

              <div className="space-y-1">
                <p
                  className={cn(
                    "font-semibold",
                    compact ? "text-base" : "text-lg sm:text-xl"
                  )}
                >
                  {compact ? "Add more files" : "Drop files here or browse"}
                </p>
                {!compact && (
                  <p className="text-muted-foreground text-sm">
                    PDF, EPUB, TXT up to {MAX_FILE_SIZE / 1024 / 1024}MB each
                  </p>
                )}
              </div>

              {!compact && (
                <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
                  <Badge variant="secondary" className="text-xs font-normal">
                    PDF
                  </Badge>
                  <Badge variant="secondary" className="text-xs font-normal">
                    EPUB
                  </Badge>
                  <Badge variant="secondary" className="text-xs font-normal">
                    TXT
                  </Badge>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Rejection toast */}
      <AnimatePresence>
        {rejectionMessage && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-4 left-4 right-4 bg-destructive text-destructive-foreground text-sm px-4 py-2 rounded-lg shadow-lg"
          >
            {rejectionMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Corner decorations */}
      {!compact && (
        <>
          <div className="absolute top-3 left-3 w-6 h-6 border-t-2 border-l-2 border-muted-foreground/20 rounded-tl-lg transition-colors duration-200" />
          <div className="absolute top-3 right-3 w-6 h-6 border-t-2 border-r-2 border-muted-foreground/20 rounded-tr-lg transition-colors duration-200" />
          <div className="absolute bottom-3 left-3 w-6 h-6 border-b-2 border-l-2 border-muted-foreground/20 rounded-bl-lg transition-colors duration-200" />
          <div className="absolute bottom-3 right-3 w-6 h-6 border-b-2 border-r-2 border-muted-foreground/20 rounded-br-lg transition-colors duration-200" />
        </>
      )}
    </div>
  );
}
