"use client";

import React, {
    createContext,
    useContext,
    useState,
    useCallback,
    useRef,
    useEffect,
    ReactNode,
} from "react";
import { apiFetch } from "@/lib/fetcher";
import {
    UploadFile,
    UploadProgress,
    UploadStatus,
    UploadStats,
    UploadContextType,
    UploadErrorCode,
    DEFAULT_MAX_CONCURRENT,
    MAX_RETRIES,
    RETRY_DELAY_MS,
} from "./types";

const UploadContext = createContext<UploadContextType | undefined>(undefined);

// Calculate upload statistics from uploads array
function calculateStats(uploads: UploadProgress[]): UploadStats {
    const stats: UploadStats = {
        total: uploads.length,
        queued: 0,
        uploading: 0,
        completed: 0,
        failed: 0,
        paused: 0,
        totalBytes: 0,
        uploadedBytes: 0,
        overallProgress: 0,
        averageSpeed: 0,
        estimatedTimeRemaining: 0,
    };

    let totalSpeed = 0;
    let speedCount = 0;

    for (const upload of uploads) {
        stats.totalBytes += upload.size;
        stats.uploadedBytes += upload.bytesUploaded;

        switch (upload.status) {
            case "queued":
                stats.queued++;
                break;
            case "uploading":
            case "processing":
                stats.uploading++;
                if (upload.speed && upload.speed > 0) {
                    totalSpeed += upload.speed;
                    speedCount++;
                }
                break;
            case "completed":
                stats.completed++;
                break;
            case "error":
                stats.failed++;
                break;
            case "paused":
                stats.paused++;
                break;
        }
    }

    stats.overallProgress =
        stats.totalBytes > 0
            ? Math.round((stats.uploadedBytes / stats.totalBytes) * 100)
            : 0;

    stats.averageSpeed = speedCount > 0 ? totalSpeed / speedCount : 0;

    const remainingBytes = stats.totalBytes - stats.uploadedBytes;
    stats.estimatedTimeRemaining =
        stats.averageSpeed > 0 ? remainingBytes / stats.averageSpeed : 0;

    return stats;
}

export function UploadProviderEnhanced({ children }: { children: ReactNode }) {
    const [uploads, setUploads] = useState<UploadProgress[]>([]);
    const [isPaused, setIsPaused] = useState(false);
    const [maxConcurrent, setMaxConcurrent] = useState(DEFAULT_MAX_CONCURRENT);

    // Track active uploads for concurrent limit
    const activeUploadsRef = useRef<Set<string>>(new Set());
    const uploadQueueRef = useRef<string[]>([]);

    // Calculate stats on each render (memoized in real app)
    const stats = calculateStats(uploads);

    // Update upload state helper
    const updateUpload = useCallback(
        (id: string, updates: Partial<UploadProgress>) => {
            setUploads((prev) =>
                prev.map((u) => (u.id === id ? { ...u, ...updates } : u))
            );
        },
        []
    );

    // Process next upload in queue
    const processQueue = useCallback(() => {
        if (isPaused) return;

        const activeCount = activeUploadsRef.current.size;
        const availableSlots = maxConcurrent - activeCount;

        if (availableSlots <= 0) return;

        // Find queued uploads that aren't being processed
        setUploads((current) => {
            const queued = current.filter(
                (u) =>
                    u.status === "queued" && !activeUploadsRef.current.has(u.id)
            );

            // Start uploads up to available slots
            const toStart = queued.slice(0, availableSlots);
            toStart.forEach((upload) => {
                activeUploadsRef.current.add(upload.id);
                processUpload(upload);
            });

            return current;
        });
    }, [isPaused, maxConcurrent]);

    // Process a single upload
    const processUpload = async (uploadData: UploadProgress) => {
        const uploadId = uploadData.id;

        try {
            // Update status to processing
            updateUpload(uploadId, {
                status: "processing",
                startTime: Date.now(),
            });

            // Create presigned URL
            const requestPayload = {
                title: uploadData.file.title,
                author: uploadData.file.author,
                description: uploadData.file.description || "No description provided",
                filename: uploadData.file.fileName,
                mime: uploadData.file.mime,
                sizeBytes: uploadData.file.sizeBytes,
                pageCount: uploadData.file.pageCount || 0,
                customCoverFilename: uploadData.file.customCoverFilename,
                customCoverMime: uploadData.file.customCoverMime,
            };

            const presignResponse = await apiFetch(
                "POST",
                "/api/books/createBookAndPresign",
                requestPayload
            );

            const response = {
                bookId: presignResponse.bookId,
                storageKey: presignResponse.storageKey,
                upload: {
                    url: presignResponse.upload.url,
                    headers: presignResponse.upload.headers,
                },
                coverStorageKey: presignResponse.coverStorageKey,
                coverUpload: {
                    url: presignResponse.coverUpload?.url,
                    headers: presignResponse.coverUpload?.headers || {},
                },
            };

            // Update with presign data
            updateUpload(uploadId, {
                status: "uploading",
                bookId: response.bookId,
                storageKey: response.storageKey,
                coverStorageKey: response.coverStorageKey,
            });

            // Upload main file with progress tracking
            await uploadFileWithProgress(
                uploadData.file.file,
                response.upload.url,
                response.upload.headers,
                uploadId
            );

            // Upload cover if exists
            if (uploadData.file.coverFile && response.coverUpload?.url) {
                await uploadFileWithProgress(
                    uploadData.file.coverFile,
                    response.coverUpload.url,
                    response.coverUpload.headers,
                    uploadId,
                    true
                );
            }

            // Finalize the book
            await apiFetch("POST", "/api/books/finalize", {
                bookId: response.bookId,
            });

            // Finalize cover if exists
            if (uploadData.file.coverFile && response.coverStorageKey) {
                await apiFetch("POST", "/api/books/finalizeCover", {
                    bookId: response.bookId,
                });
            }

            // Mark as completed
            updateUpload(uploadId, {
                status: "completed",
                progress: 100,
                bytesUploaded: uploadData.size,
                speed: undefined,
                eta: undefined,
            });
        } catch (error) {
            console.error(`[Upload ${uploadId}] Upload failed:`, error);

            const errorCode: UploadErrorCode =
                error instanceof Error
                    ? error.message.includes("network")
                        ? "NETWORK_ERROR"
                        : error.message.includes("timeout")
                            ? "TIMEOUT"
                            : "SERVER_ERROR"
                    : "UNKNOWN";

            // Check if we should auto-retry
            const currentUpload = uploads.find((u) => u.id === uploadId);
            if (
                currentUpload &&
                currentUpload.retryCount < MAX_RETRIES &&
                errorCode === "NETWORK_ERROR"
            ) {
                // Schedule retry
                updateUpload(uploadId, {
                    retryCount: currentUpload.retryCount + 1,
                    status: "queued",
                    error: `Retrying... (attempt ${currentUpload.retryCount + 2}/${MAX_RETRIES + 1})`,
                });
                setTimeout(() => processQueue(), RETRY_DELAY_MS);
            } else {
                updateUpload(uploadId, {
                    status: "error",
                    error: error instanceof Error ? error.message : "Unknown error",
                    errorCode,
                });
            }
        } finally {
            activeUploadsRef.current.delete(uploadId);
            // Process next in queue
            setTimeout(() => processQueue(), 100);
        }
    };

    // Upload file with XHR for progress and cancellation
    const uploadFileWithProgress = (
        file: File,
        url: string,
        headers: Record<string, string>,
        uploadId: string,
        isCover = false
    ): Promise<void> => {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            let lastLoaded = 0;
            let lastTime = Date.now();

            // Store XHR reference for cancellation
            updateUpload(uploadId, { xhr });

            xhr.upload.addEventListener("progress", (event) => {
                if (event.lengthComputable) {
                    const progress = (event.loaded / event.total) * 100;
                    const now = Date.now();
                    const timeDelta = (now - lastTime) / 1000; // seconds
                    const bytesDelta = event.loaded - lastLoaded;

                    // Calculate speed (smoothed)
                    const instantSpeed = timeDelta > 0 ? bytesDelta / timeDelta : 0;

                    setUploads((prev) => {
                        const current = prev.find((u) => u.id === uploadId);
                        const smoothedSpeed = current?.speed
                            ? current.speed * 0.7 + instantSpeed * 0.3
                            : instantSpeed;

                        const remaining = event.total - event.loaded;
                        const eta = smoothedSpeed > 0 ? remaining / smoothedSpeed : 0;

                        return prev.map((u) =>
                            u.id === uploadId
                                ? {
                                    ...u,
                                    progress: isCover ? Math.max(u.progress, progress) : progress,
                                    bytesUploaded: isCover
                                        ? Math.max(u.bytesUploaded, event.loaded)
                                        : event.loaded,
                                    speed: smoothedSpeed,
                                    eta,
                                }
                                : u
                        );
                    });

                    lastLoaded = event.loaded;
                    lastTime = now;
                }
            });

            xhr.addEventListener("load", () => {
                updateUpload(uploadId, { xhr: undefined });
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve();
                } else {
                    reject(new Error(`Upload failed with status ${xhr.status}`));
                }
            });

            xhr.addEventListener("error", () => {
                updateUpload(uploadId, { xhr: undefined });
                reject(new Error("Network error during upload"));
            });

            xhr.addEventListener("abort", () => {
                updateUpload(uploadId, { xhr: undefined });
                reject(new Error("Upload cancelled"));
            });

            xhr.addEventListener("timeout", () => {
                updateUpload(uploadId, { xhr: undefined });
                reject(new Error("Upload timeout"));
            });

            xhr.open("PUT", url);
            xhr.timeout = 5 * 60 * 1000; // 5 minute timeout

            // Set headers
            Object.entries(headers).forEach(([k, v]) => {
                const key = k.toLowerCase();
                if (key === "content-length") return;
                if (key.startsWith("x-amz-checksum")) return;
                xhr.setRequestHeader(k, v);
            });

            xhr.send(file);
        });
    };

    // Add new uploads
    const addUploads = useCallback((files: UploadFile[]) => {
        const newUploads: UploadProgress[] = files.map((file, index) => ({
            id: crypto.randomUUID(),
            file,
            title: file.title,
            author: file.author,
            name: file.fileName,
            size: file.sizeBytes,
            cover: file.coverPreview,
            status: "queued" as UploadStatus,
            progress: 0,
            bytesUploaded: 0,
            retryCount: 0,
            queuePosition: index,
        }));

        setUploads((prev) => [...prev, ...newUploads]);

        // Trigger queue processing
        setTimeout(() => processQueue(), 100);
    }, [processQueue]);

    // Remove upload
    const removeUpload = useCallback((id: string) => {
        setUploads((prev) => {
            const upload = prev.find((u) => u.id === id);
            if (upload?.xhr) {
                upload.xhr.abort();
            }
            activeUploadsRef.current.delete(id);
            return prev.filter((u) => u.id !== id);
        });
        setTimeout(() => processQueue(), 100);
    }, [processQueue]);

    // Cancel upload
    const cancelUpload = useCallback((id: string) => {
        setUploads((prev) => {
            const upload = prev.find((u) => u.id === id);
            if (upload?.xhr) {
                upload.xhr.abort();
            }
            activeUploadsRef.current.delete(id);
            return prev.map((u) =>
                u.id === id
                    ? { ...u, status: "error" as UploadStatus, error: "Cancelled", errorCode: "CANCELLED" as UploadErrorCode }
                    : u
            );
        });
        setTimeout(() => processQueue(), 100);
    }, [processQueue]);

    // Retry upload
    const retryUpload = useCallback((id: string) => {
        updateUpload(id, {
            status: "queued",
            progress: 0,
            bytesUploaded: 0,
            error: undefined,
            errorCode: undefined,
            retryCount: 0,
        });
        setTimeout(() => processQueue(), 100);
    }, [updateUpload, processQueue]);

    // Pause upload
    const pauseUpload = useCallback((id: string) => {
        setUploads((prev) => {
            const upload = prev.find((u) => u.id === id);
            if (upload?.xhr) {
                upload.xhr.abort();
            }
            activeUploadsRef.current.delete(id);
            return prev.map((u) =>
                u.id === id ? { ...u, status: "paused" as UploadStatus, xhr: undefined } : u
            );
        });
    }, []);

    // Resume upload
    const resumeUpload = useCallback((id: string) => {
        updateUpload(id, {
            status: "queued",
            error: undefined,
        });
        setTimeout(() => processQueue(), 100);
    }, [updateUpload, processQueue]);

    // Batch actions
    const pauseAll = useCallback(() => {
        setIsPaused(true);
        setUploads((prev) =>
            prev.map((u) => {
                if (u.status === "uploading" || u.status === "queued") {
                    if (u.xhr) u.xhr.abort();
                    activeUploadsRef.current.delete(u.id);
                    return { ...u, status: "paused" as UploadStatus, xhr: undefined };
                }
                return u;
            })
        );
    }, []);

    const resumeAll = useCallback(() => {
        setIsPaused(false);
        setUploads((prev) =>
            prev.map((u) =>
                u.status === "paused" ? { ...u, status: "queued" as UploadStatus } : u
            )
        );
        setTimeout(() => processQueue(), 100);
    }, [processQueue]);

    const cancelAll = useCallback(() => {
        setUploads((prev) => {
            prev.forEach((u) => {
                if (u.xhr) u.xhr.abort();
                activeUploadsRef.current.delete(u.id);
            });
            return prev.map((u) =>
                u.status !== "completed"
                    ? { ...u, status: "error" as UploadStatus, error: "Cancelled", errorCode: "CANCELLED" as UploadErrorCode, xhr: undefined }
                    : u
            );
        });
    }, []);

    const retryAllFailed = useCallback(() => {
        setUploads((prev) =>
            prev.map((u) =>
                u.status === "error"
                    ? {
                        ...u,
                        status: "queued" as UploadStatus,
                        progress: 0,
                        bytesUploaded: 0,
                        error: undefined,
                        errorCode: undefined,
                        retryCount: 0,
                    }
                    : u
            )
        );
        setTimeout(() => processQueue(), 100);
    }, [processQueue]);

    const clearCompleted = useCallback(() => {
        setUploads((prev) => prev.filter((u) => u.status !== "completed"));
    }, []);

    const clearAll = useCallback(() => {
        setUploads((prev) => {
            prev.forEach((u) => {
                if (u.xhr) u.xhr.abort();
            });
            return [];
        });
        activeUploadsRef.current.clear();
    }, []);

    // Process queue when relevant state changes
    useEffect(() => {
        if (!isPaused) {
            processQueue();
        }
    }, [isPaused, maxConcurrent, processQueue]);

    return (
        <UploadContext.Provider
            value={{
                uploads,
                stats,
                isPaused,
                maxConcurrent,
                addUploads,
                removeUpload,
                cancelUpload,
                retryUpload,
                pauseUpload,
                resumeUpload,
                pauseAll,
                resumeAll,
                cancelAll,
                retryAllFailed,
                clearCompleted,
                clearAll,
                setMaxConcurrent,
            }}
        >
            {children}
        </UploadContext.Provider>
    );
}

export function useUpload() {
  const context = useContext(UploadContext);
  if (context === undefined) {
    throw new Error("useUpload must be used within an UploadProvider");
  }
  return context;
}

// Aliases for compatibility
export const UploadProvider = UploadProviderEnhanced;
export const useUploadEnhanced = useUpload;
