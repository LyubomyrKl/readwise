"use client";

import React, { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileRejection } from "react-dropzone";
import {
    FileText,
    Upload,
    X,
    Sparkles,
    BookOpen,
    ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
    FileDropZone,
    UploadQueue,
} from "@/app/(components)/FileUpload";
import {
    useUploadEnhanced,
    UploadProviderEnhanced,
    UploadFile,
} from "@/app/(providers)/UploadProvider";
import { extractBookMetadata } from "@/lib/bookParser";
import Link from "next/link";

// Pending file state for editing before upload
interface PendingFile {
    id: string;
    file: File;
    title: string;
    author: string;
    description: string;
    pageCount: number | null;
    isParsingMetadata: boolean;
    extractedCover?: string;
    coverFile?: File;
    coverPreview?: string;
}

function BulkUploadContent() {
    const {
        uploads,
        stats,
        isPaused,
        addUploads,
        cancelUpload,
        removeUpload,
        retryUpload,
        pauseUpload,
        resumeUpload,
        pauseAll,
        resumeAll,
        cancelAll,
        retryAllFailed,
        clearCompleted,
    } = useUploadEnhanced();

    const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
    const [expandedFileId, setExpandedFileId] = useState<string | null>(null);

    // Handle files dropped/selected
    const handleFilesAccepted = useCallback(async (files: File[]) => {
        const newPendingFiles: PendingFile[] = files.map((file) => {
            const baseName = file.name.replace(/\.[^/.]+$/, "");
            return {
                id: crypto.randomUUID(),
                file,
                title: baseName,
                author: "",
                description: "",
                pageCount: null,
                isParsingMetadata: true,
            };
        });

        setPendingFiles((prev) => [...prev, ...newPendingFiles]);

        // Extract metadata asynchronously
        for (const pendingFile of newPendingFiles) {
            try {
                const metadata = await extractBookMetadata(pendingFile.file);
                const baseName = pendingFile.file.name.replace(/\.[^/.]+$/, "");

                setPendingFiles((prev) =>
                    prev.map((f) =>
                        f.id === pendingFile.id
                            ? {
                                ...f,
                                title: metadata.title || baseName,
                                author: metadata.author || "",
                                description: metadata.description || "",
                                pageCount: metadata.pageCount,
                                extractedCover: metadata.coverImage,
                                isParsingMetadata: false,
                            }
                            : f
                    )
                );
            } catch (error) {
                console.error("Failed to extract metadata:", error);
                setPendingFiles((prev) =>
                    prev.map((f) =>
                        f.id === pendingFile.id ? { ...f, isParsingMetadata: false } : f
                    )
                );
            }
        }

        toast.success(
            `${files.length} file${files.length !== 1 ? "s" : ""} added to queue`
        );
    }, []);

    // Handle file rejections
    const handleFilesRejected = useCallback((rejections: FileRejection[]) => {
        const count = rejections.length;
        toast.error(
            `${count} file${count !== 1 ? "s" : ""} rejected. Check file type and size.`
        );
    }, []);

    // Update pending file field
    const updatePendingFile = (
        fileId: string,
        field: keyof PendingFile,
        value: string | File | null
    ) => {
        setPendingFiles((prev) =>
            prev.map((file) =>
                file.id === fileId ? { ...file, [field]: value } : file
            )
        );
    };

    // Handle cover upload
    const handleCoverUpload = (fileId: string, coverFile: File) => {
        const coverPreview = URL.createObjectURL(coverFile);
        setPendingFiles((prev) =>
            prev.map((file) =>
                file.id === fileId ? { ...file, coverFile, coverPreview } : file
            )
        );
    };

    // Remove pending file
    const removePendingFile = (fileId: string) => {
        setPendingFiles((prev) => prev.filter((file) => file.id !== fileId));
    };

    // Check if pending file is valid
    const isPendingFileValid = (file: PendingFile) =>
        file.title.trim() && file.author.trim() && !file.isParsingMetadata;

    // Get MIME type with fallback
    const getMimeType = (file: File): string => {
        const fileName = file.name.toLowerCase();
        let mimeType = file.type;

        if (fileName.endsWith(".epub") && (!mimeType || mimeType === "application/octet-stream")) {
            return "application/epub+zip";
        }
        if (fileName.endsWith(".pdf") && (!mimeType || mimeType === "application/octet-stream")) {
            return "application/pdf";
        }
        if (fileName.endsWith(".txt") && (!mimeType || mimeType === "application/octet-stream")) {
            return "text/plain";
        }
        return mimeType;
    };

    // Convert extracted cover to File
    const convertCoverToFile = async (
        base64Cover: string,
        fileName: string
    ): Promise<File | undefined> => {
        try {
            const response = await fetch(base64Cover);
            const blob = await response.blob();
            return new File([blob], `${fileName}-cover.jpg`, { type: "image/jpeg" });
        } catch {
            return undefined;
        }
    };

    // Upload a single pending file
    const uploadSingleFile = async (pendingFile: PendingFile) => {
        let coverFileToUpload = pendingFile.coverFile;

        if (!coverFileToUpload && pendingFile.extractedCover) {
            coverFileToUpload = await convertCoverToFile(
                pendingFile.extractedCover,
                pendingFile.file.name.replace(/\.[^/.]+$/, "")
            );
        }

        const uploadFile: UploadFile = {
            title: pendingFile.title,
            author: pendingFile.author,
            description: pendingFile.description || "No description provided",
            fileName: pendingFile.file.name,
            mime: getMimeType(pendingFile.file),
            sizeBytes: pendingFile.file.size,
            pageCount: pendingFile.pageCount,
            file: pendingFile.file,
            coverPreview: pendingFile.coverPreview || pendingFile.extractedCover,
            ...(coverFileToUpload && {
                customCoverFilename: coverFileToUpload.name,
                customCoverMime: coverFileToUpload.type,
                coverFile: coverFileToUpload,
            }),
        };

        addUploads([uploadFile]);
        removePendingFile(pendingFile.id);
    };

    // Upload all valid pending files
    const uploadAllPending = async () => {
        const validFiles = pendingFiles.filter(isPendingFileValid);
        if (validFiles.length === 0) {
            toast.error("No valid files to upload. Please fill in required fields.");
            return;
        }

        for (const file of validFiles) {
            await uploadSingleFile(file);
        }

        toast.success(`Started uploading ${validFiles.length} files`);
    };

    // Count valid and total pending files
    const validPendingCount = pendingFiles.filter(isPendingFileValid).length;
    const totalPendingCount = pendingFiles.length;

    return (
        <section className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6 sm:space-y-8">
            {/* Header */}
            <div className="space-y-2">
                <div className="flex items-center gap-2">
                    <Upload className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                    <h1 className="text-xl sm:text-2xl font-semibold">Upload Books</h1>
                </div>
                <p className="text-sm sm:text-base text-muted-foreground">
                    Drop your files to add them to your library. We support bulk uploads
                    of PDF, EPUB, and TXT files.
                </p>
            </div>

            {/* Drop Zone - Always visible but compact when files exist */}
            <FileDropZone
                onFilesAccepted={handleFilesAccepted}
                onFilesRejected={handleFilesRejected}
                compact={pendingFiles.length > 0 || uploads.length > 0}
            />

            {/* Pending Files Section */}
            <AnimatePresence>
                {pendingFiles.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="space-y-4"
                    >
                        {/* Section header */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <Sparkles className="h-5 w-5 text-amber-500" />
                                <h2 className="text-base sm:text-lg font-medium">
                                    Ready to Upload ({validPendingCount}/{totalPendingCount})
                                </h2>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setPendingFiles([])}
                                    className="flex-1 sm:flex-none"
                                >
                                    Clear All
                                </Button>
                                <Button
                                    onClick={uploadAllPending}
                                    disabled={validPendingCount === 0}
                                    size="sm"
                                    className="flex-1 sm:flex-none"
                                >
                                    Upload {validPendingCount > 0 ? `(${validPendingCount})` : ""}
                                </Button>
                            </div>
                        </div>

                        {/* Pending files grid */}
                        <div className="grid gap-4">
                            {pendingFiles.map((file) => (
                                <Card
                                    key={file.id}
                                    className={`transition-all duration-200 ${
                                        isPendingFileValid(file)
                                            ? "border-emerald-500/50 bg-emerald-500/5"
                                            : "border-amber-500/50 bg-amber-500/5"
                                    }`}
                                >
                                    <CardHeader className="pb-3 px-3 sm:px-6">
                                        <div className="flex items-start justify-between gap-2 sm:gap-4">
                                            <div className="flex items-start gap-2 sm:gap-3 min-w-0">
                                                {/* Cover preview */}
                                                <div className="relative w-12 h-16 rounded border overflow-hidden bg-muted shrink-0 group cursor-pointer">
                                                    {file.coverPreview || file.extractedCover ? (
                                                        <img
                                                            src={file.coverPreview || file.extractedCover}
                                                            alt="Cover"
                                                            className="w-full h-full object-cover"
                                                        />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center">
                                                            <FileText className="h-6 w-6 text-muted-foreground" />
                                                        </div>
                                                    )}
                                                    <input
                                                        type="file"
                                                        accept="image/*"
                                                        onChange={(e) => {
                                                            const coverFile = e.target.files?.[0];
                                                            if (coverFile) handleCoverUpload(file.id, coverFile);
                                                        }}
                                                        className="absolute inset-0 opacity-0 cursor-pointer"
                                                        title="Upload custom cover"
                                                    />
                                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                        <Upload className="h-4 w-4 text-white" />
                                                    </div>
                                                </div>

                                                <div className="min-w-0 flex-1">
                                                    <CardTitle className="text-sm sm:text-base truncate">
                                                        {file.file.name}
                                                    </CardTitle>
                                                    <div className="flex flex-wrap items-center gap-1 sm:gap-2 mt-1">
                            <span className="text-xs sm:text-sm text-muted-foreground">
                              {(file.file.size / 1024 / 1024).toFixed(1)} MB
                            </span>
                                                        {file.isParsingMetadata && (
                                                            <Badge variant="secondary" className="text-xs">
                                <span className="animate-pulse">
                                  Parsing...
                                </span>
                                                            </Badge>
                                                        )}
                                                        {!file.isParsingMetadata && file.pageCount && (
                                                            <Badge variant="secondary" className="text-xs">
                                                                {file.pageCount} pages
                                                            </Badge>
                                                        )}
                                                        {isPendingFileValid(file) ? (
                                                            <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs">
                                                                Ready
                                                            </Badge>
                                                        ) : (
                                                            <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs">
                                                                Needs info
                                                            </Badge>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 shrink-0">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() =>
                                                        setExpandedFileId(
                                                            expandedFileId === file.id ? null : file.id
                                                        )
                                                    }
                                                >
                                                    {expandedFileId === file.id ? "Collapse" : "Edit"}
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-8 w-8 p-0"
                                                    onClick={() => removePendingFile(file.id)}
                                                >
                                                    <X className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    </CardHeader>

                                    {/* Expanded edit form */}
                                    <AnimatePresence>
                                        {expandedFileId === file.id && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: "auto", opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.2 }}
                                                className="overflow-hidden"
                                            >
                                                <CardContent className="pt-0 space-y-4">
                                                    <Separator />
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                        <div className="space-y-2">
                                                            <Label htmlFor={`title-${file.id}`}>
                                                                Title <span className="text-destructive">*</span>
                                                            </Label>
                                                            <Input
                                                                id={`title-${file.id}`}
                                                                value={file.title}
                                                                onChange={(e) =>
                                                                    updatePendingFile(
                                                                        file.id,
                                                                        "title",
                                                                        e.target.value
                                                                    )
                                                                }
                                                                placeholder="Enter book title"
                                                            />
                                                        </div>
                                                        <div className="space-y-2">
                                                            <Label htmlFor={`author-${file.id}`}>
                                                                Author <span className="text-destructive">*</span>
                                                            </Label>
                                                            <Input
                                                                id={`author-${file.id}`}
                                                                value={file.author}
                                                                onChange={(e) =>
                                                                    updatePendingFile(
                                                                        file.id,
                                                                        "author",
                                                                        e.target.value
                                                                    )
                                                                }
                                                                placeholder="Enter author name"
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <Label htmlFor={`description-${file.id}`}>
                                                            Description
                                                        </Label>
                                                        <Textarea
                                                            id={`description-${file.id}`}
                                                            value={file.description}
                                                            onChange={(e) =>
                                                                updatePendingFile(
                                                                    file.id,
                                                                    "description",
                                                                    e.target.value
                                                                )
                                                            }
                                                            placeholder="Enter book description (optional)"
                                                            rows={2}
                                                        />
                                                    </div>
                                                    <div className="flex justify-end">
                                                        <Button
                                                            onClick={() => uploadSingleFile(file)}
                                                            disabled={!isPendingFileValid(file)}
                                                            size="sm"
                                                        >
                                                            Upload This Book
                                                            <ArrowRight className="h-4 w-4 ml-1" />
                                                        </Button>
                                                    </div>
                                                </CardContent>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </Card>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Upload Queue Section */}
            <AnimatePresence>
                {uploads.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="space-y-4"
                    >
                        <div className="flex items-center gap-2">
                            <BookOpen className="h-5 w-5 text-primary" />
                            <h2 className="text-lg font-medium">Upload Progress</h2>
                        </div>

                        <UploadQueue
                            uploads={uploads}
                            stats={stats}
                            isPaused={isPaused}
                            onCancel={cancelUpload}
                            onRemove={removeUpload}
                            onRetry={retryUpload}
                            onPause={pauseUpload}
                            onResume={resumeUpload}
                            onPauseAll={pauseAll}
                            onResumeAll={resumeAll}
                            onCancelAll={cancelAll}
                            onRetryFailed={retryAllFailed}
                            onClearCompleted={clearCompleted}
                        />

                        {/* Success CTA */}
                        {stats.completed > 0 && stats.uploading === 0 && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex justify-center"
                            >
                                <Button asChild variant="outline">
                                    <Link href="/reader/library">
                                        View Library
                                        <ArrowRight className="h-4 w-4 ml-2" />
                                    </Link>
                                </Button>
                            </motion.div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Empty state */}
            {pendingFiles.length === 0 && uploads.length === 0 && (
                <div className="text-center text-muted-foreground py-8">
                    <p>No files queued. Drop files above or click to browse.</p>
                </div>
            )}
        </section>
    );
}

// Wrap with provider
export default function BulkUploadPage() {
    return (
        <UploadProviderEnhanced>
            <BulkUploadContent />
        </UploadProviderEnhanced>
    );
}
