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
    console.log(
      "addUploads received files:",
      files.map((f) => ({
        title: f.title,
        fileName: f.fileName,
        customCoverFilename: f.customCoverFilename,
        customCoverMime: f.customCoverMime,
        customCoverSizeBytes: f.customCoverSizeBytes,
        hasCoverFile: !!f.coverFile,
      }))
    );

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

      console.log(`[Upload ${uploadId}] Calling createBookAndPresign API`);
      console.log(`[Upload ${uploadId}] Cover fields from file:`, {
        customCoverFilename: currentUpload.file.customCoverFilename,
        customCoverMime: currentUpload.file.customCoverMime,
        customCoverSizeBytes: currentUpload.file.customCoverSizeBytes,
        hasCoverFile: !!currentUpload.file.coverFile,
      });

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

      console.log(
        `[Upload ${uploadId}] Request payload:`,
        JSON.stringify(requestPayload, null, 2)
      );

      const presignResponse = await apiFetch(
        "POST",
        "/api/books/createBookAndPresign",
        requestPayload
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

      console.log(`[Upload ${uploadId}] Starting file upload to storage`);
      console.log(`[Upload ${uploadId}] Upload URL:`, response.upload.url);
      console.log(
        `[Upload ${uploadId}] Upload headers:`,
        response.upload.headers
      );
      console.log(`[Upload ${uploadId}] File details:`, {
        name: currentUpload.file.file.name,
        size: currentUpload.file.file.size,
        type: currentUpload.file.file.type,
      });

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
          response.coverUpload.url!,
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
          console.log(`[Upload ${uploadId}] Upload successful (${xhr.status})`);
          resolve();
        } else {
          console.error(`[Upload ${uploadId}] Upload failed:`, {
            status: xhr.status,
            statusText: xhr.statusText,
            response: xhr.responseText,
            url: url,
            headers: headers,
          });

          // Parse XML error if it's from S3/MinIO
          if (xhr.responseText.includes("<Error>")) {
            try {
              const parser = new DOMParser();
              const xmlDoc = parser.parseFromString(
                xhr.responseText,
                "text/xml"
              );
              const code = xmlDoc.querySelector("Code")?.textContent;
              const message = xmlDoc.querySelector("Message")?.textContent;
              console.error(`[Upload ${uploadId}] S3/MinIO Error:`, {
                code,
                message,
              });
            } catch (e) {
              console.error(`[Upload ${uploadId}] Failed to parse XML error`);
            }
          }
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      });

      xhr.addEventListener("error", () => {
        console.error(`[Upload ${uploadId}] Upload network error`);
        reject(new Error("Upload failed"));
      });

      xhr.open("PUT", url);

      // Only set headers that are provided by the presigned URL
      Object.entries(headers).forEach(([k, v]) => {
        console.log(`[Upload ${uploadId}] Setting header: ${k} = ${v}`);

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
