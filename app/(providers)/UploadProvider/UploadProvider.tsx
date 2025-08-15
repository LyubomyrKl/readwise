"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";
import * as CryptoJS from "crypto-js";
import * as pdfjsLib from "pdfjs-dist";
import JSZip from "jszip";
import { apiFetch } from "@/lib/fetcher";
import { int } from "zod";

// Set worker src for PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

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
      console.log(`[Upload ${uploadId}] Starting upload process`);

      // Update status to processing
      setUnfinishedUploads((prev) =>
        prev.map((upload) =>
          upload.id === uploadId
            ? { ...upload, status: "processing" as const }
            : upload
        )
      );

      const currentUpload = uploadData;

      console.log(`[Upload ${uploadId}] Calculating SHA256 hash`);
      // Calculate SHA256 hash
      const sha256 = await calculateSHA256(currentUpload.file.file);
      console.log(`[Upload ${uploadId}] SHA256 calculated: ${sha256}`);

      console.log(`[Upload ${uploadId}] Calling createBookAndPresign API`);
      // Call createBookAndPresign
      const presignResponse = await apiFetch(
        "POST",
        "/api/books/createBookAndPresign",
        {
          title: currentUpload.file.title,
          author: currentUpload.file.author,
          filename: currentUpload.file.fileName,
          description:
            currentUpload.file.description || "No description provided",
          mime: currentUpload.file.mime,
          sizeBytes: currentUpload.file.sizeBytes,
          sha256,
          cover: currentUpload.file.customCoverFilename,
        }
      );

      console.log(
        `[Upload ${uploadId}] createBookAndPresign response:`,
        presignResponse
      );

      const response = {
        bookId: presignResponse.bookId,
        storageKey: presignResponse.storageKey,
        upload: {
          url: presignResponse.upload.url,
          headers: presignResponse.upload.headers,
        },
        coverStorageKey: presignResponse.coverStorageKey,
        coverUpload: presignResponse.coverUpload,
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

      console.log(`[Upload ${uploadId}] Starting file upload to storage`);
      // Upload main file
      await uploadFile(
        currentUpload.file.file,
        response.upload.url,
        response.upload.headers,
        uploadId
      );
      console.log(`[Upload ${uploadId}] Main file uploaded successfully`);

      // Upload cover if exists
      if (currentUpload.file.coverFile && response.coverUpload) {
        console.log(`[Upload ${uploadId}] Starting cover upload`);
        await uploadFile(
          currentUpload.file.coverFile,
          response.coverUpload.url,
          response.coverUpload.headers,
          uploadId,
          true
        );
        console.log(`[Upload ${uploadId}] Cover uploaded successfully`);
      }

      console.log(`[Upload ${uploadId}] Finalizing book with API`);
      // Finalize the book after upload is complete
      await apiFetch("POST", "/api/books/finalize", {
        bookId: response.bookId,
      });
      console.log(`[Upload ${uploadId}] Book finalized successfully`);

      // Finalize cover if it exists
      if (currentUpload.file.coverFile && response.coverStorageKey) {
        console.log(`[Upload ${uploadId}] Finalizing cover with API`);
        await apiFetch("POST", "/api/books/finalizeCover", {
          bookId: response.bookId,
        });
        console.log(`[Upload ${uploadId}] Cover finalized successfully`);
      }

      console.log(`[Upload ${uploadId}] Upload process completed successfully`);
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

  const processUpload = async (uploadId: string) => {
    // Find upload in current state
    const currentUpload = unfinishedUploads.find((u) => u.id === uploadId);
    if (!currentUpload) {
      console.error(`[Upload ${uploadId}] Upload not found in state`);
      return;
    }
    await processUploadWithData(currentUpload);
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

      // Set headers
      Object.entries(headers).forEach(([key, value]) => {
        xhr.setRequestHeader(key, value);
      });

      xhr.send(file);
    });
  };

  const calculateSHA256 = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer();
    const wordArray = CryptoJS.lib.WordArray.create(buffer);
    return CryptoJS.SHA256(wordArray).toString();
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
