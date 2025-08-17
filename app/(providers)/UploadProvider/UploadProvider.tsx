"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";
import { apiFetch } from "@/lib/fetcher";

export interface UploadFileMetadata {
  title: string;
  author: string;
  description?: string;
  fileName: string;
  mime: string;
  sizeBytes: number;
  customCoverFilename?: string;
  customCoverMime?: string;
  customCoverSizeBytes?: number;
}

export interface UploadFile extends UploadFileMetadata {
  file: File;
  coverFile?: File;
}

export interface UploadProgress {
  id: string;
  file: UploadFile;
  title: string;
  author: string;
  name: string;
  size: number;
  cover?: string;
  status: "pending" | "processing" | "uploading" | "completed" | "error";
  progress: number;
  error?: string;
  bookId?: string;
  storageKey?: string;
  coverStorageKey?: string;
}

interface UploadContextType {
  unfinishedUploads: UploadProgress[];
  uploads: UploadProgress[];
  addUploads: (files: UploadFile[]) => void;
  removeUpload: (id: string) => void;
  clearCompleted: () => void;
  hasActiveUploads: boolean;
}

const UploadContext = createContext<UploadContextType | undefined>(undefined);

export function UploadProvider({ children }: { children: ReactNode }) {
  const [unfinishedUploads, setUnfinishedUploads] = useState<UploadProgress[]>(
    []
  );

  const removeUpload = (id: string) => {
    setUnfinishedUploads((prev) => prev.filter((upload) => upload.id !== id));
  };

  const clearCompleted = () => {
    setUnfinishedUploads((prev) =>
      prev.filter((upload) => upload.status !== "completed")
    );
  };

  const hasActiveUploads = unfinishedUploads.some(
    (upload) => upload.status === "uploading" || upload.status === "processing"
  );

  const addUploads = async (files: UploadFile[]) => {
    // Create initial upload progress entries
    const newUploads: UploadProgress[] = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      title: file.title,
      author: file.author,
      name: file.fileName,
      size: file.sizeBytes,
      status: "pending",
      progress: 0,
    }));

    setUnfinishedUploads((prev) => [...prev, ...newUploads]);

    // Process each upload using the newUploads array directly
    for (const upload of newUploads) {
      await processUploadWithData(upload);
    }
  };

  const processUploadWithData = async (uploadData: UploadProgress) => {
    const uploadId = uploadData.id;

    try {
      // Update status to processing
      setUnfinishedUploads((prev) =>
        prev.map((upload) =>
          upload.id === uploadId
            ? { ...upload, status: "processing" as const }
            : upload
        )
      );

      const currentUpload = uploadData;

      // Call createBookAndPresign
      const requestPayload = {
        title: currentUpload.file.title,
        author: currentUpload.file.author,
        description:
          currentUpload.file.description || "No description provided",
        filename: currentUpload.file.fileName,
        mime: currentUpload.file.mime,
        sizeBytes: currentUpload.file.sizeBytes,
        customCoverFilename: currentUpload.file.customCoverFilename,
        customCoverMime: currentUpload.file.customCoverMime,
        customCoverSizeBytes: currentUpload.file.customCoverSizeBytes,
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
      setUnfinishedUploads((prev) =>
        prev.map((u) =>
          u.id === uploadId
            ? {
                ...u,
                status: "uploading" as const,
                bookId: response.bookId,
                storageKey: response.storageKey,
                coverStorageKey: response.coverStorageKey,
              }
            : u
        )
      );

      // Upload main file
      await uploadFile(
        currentUpload.file.file,
        response.upload.url,
        response.upload.headers,
        uploadId
      );

      // Upload cover if exists
      if (currentUpload.file.coverFile && response.coverUpload) {
        await uploadFile(
          currentUpload.file.coverFile,
          response.coverUpload.url!,
          response.coverUpload.headers,
          uploadId,
          true
        );
      }
      // Finalize the book after upload is complete
      await apiFetch("POST", "/api/books/finalize", {
        bookId: response.bookId,
      });

      // Finalize cover if it exists
      if (currentUpload.file.coverFile && response.coverStorageKey) {
        await apiFetch("POST", "/api/books/finalizeCover", {
          bookId: response.bookId,
        });
      }
      // Mark as completed
      setUnfinishedUploads((prev) =>
        prev.map((u) =>
          u.id === uploadId
            ? { ...u, status: "completed" as const, progress: 100 }
            : u
        )
      );
    } catch (error) {
      console.error(`[Upload ${uploadId}] Upload failed:`, error);
      setUnfinishedUploads((prev) =>
        prev.map((u) =>
          u.id === uploadId
            ? {
                ...u,
                status: "error" as const,
                error: error instanceof Error ? error.message : "Unknown error",
              }
            : u
        )
      );
    }
  };

  const uploadFile = async (
    file: File,
    url: string,
    headers: Record<string, string>,
    uploadId: string,
    isCover = false
  ) => {
    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          const progress = (event.loaded / event.total) * 100;
          setUnfinishedUploads((prev) =>
            prev.map((u) =>
              u.id === uploadId
                ? {
                    ...u,
                    progress: isCover
                      ? Math.max(u.progress, progress)
                      : progress,
                  }
                : u
            )
          );
        }
      });

      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      });

      xhr.addEventListener("error", () => {
        reject(new Error("Upload failed"));
      });

      xhr.open("PUT", url);

      // Only set headers that are provided by the presigned URL
      Object.entries(headers).forEach(([k, v]) => {
        const key = k.toLowerCase();
        if (key === "content-length") return; // blocked by browser
        if (key.startsWith("x-amz-checksum")) return; // not using checksum
        xhr.setRequestHeader(k, v);
      });

      xhr.send(file);
    });
  };

  return (
    <UploadContext.Provider
      value={{
        unfinishedUploads,
        uploads: unfinishedUploads,
        addUploads,
        removeUpload,
        clearCompleted,
        hasActiveUploads,
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
