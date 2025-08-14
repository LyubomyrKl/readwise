"use client";

import React, { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileText, AlertCircle, CheckCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { apiFetch } from "@/lib/fetcher";

interface FileWithMetadata extends File {
  id: string;
  title: string;
  author: string;
  description: string;
  progress: number;
  status: "pending" | "uploading" | "processing" | "completed" | "error";
  error?: string;
  bookId?: string;
}

export default function UploadPage() {
  const [files, setFiles] = useState<FileWithMetadata[]>([]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles: FileWithMetadata[] = acceptedFiles.map((file) => ({
      ...file,
      id: Math.random().toString(36).slice(2, 11),
      title: file.name.replace(/\.[^/.]+$/, ""), // Remove extension
      author: "",
      description: "",
      progress: 0,
      status: "pending" as const,
    }));
    
    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "application/epub+zip": [".epub"],
      "text/plain": [".txt"],
    },
    multiple: true,
  });

  const removeFile = (fileId: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  const updateFileMetadata = (
    fileId: string, 
    field: keyof Pick<FileWithMetadata, "title" | "author" | "description">, 
    value: string
  ) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === fileId ? { ...f, [field]: value } : f))
    );
  };

  const uploadFile = async (file: FileWithMetadata) => {
    if (!file.title.trim() || !file.author.trim()) {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === file.id
            ? { ...f, status: "error", error: "Title and author are required" }
            : f
        )
      );
      return;
    }

    try {
      // Update status to uploading
      setFiles((prev) =>
        prev.map((f) => (f.id === file.id ? { ...f, status: "uploading", progress: 10 } : f))
      );

      // Get presigned URL
      const presignResponse = await apiFetch("POST", "/api/books/presign", {
        title: file.title,
        author: file.author,
        description: file.description,
        filename: file.name,
        mime: file.type,
        sizeBytes: file.size,
        sha256: "placeholder", // In real implementation, calculate SHA256
      });

      // Update progress
      setFiles((prev) =>
        prev.map((f) => (f.id === file.id ? { ...f, progress: 30 } : f))
      );

      // Upload file to presigned URL
      const uploadResponse = await fetch(presignResponse.upload.url, {
        method: "PUT",
        headers: presignResponse.upload.headers,
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error("Upload failed");
      }

      // Update progress
      setFiles((prev) =>
        prev.map((f) => (f.id === file.id ? { ...f, progress: 70, status: "processing" } : f))
      );

      // Finalize the upload
      await apiFetch("POST", "/api/books/finalize", {
        bookId: presignResponse.bookId,
      });

      // Mark as completed
      setFiles((prev) =>
        prev.map((f) =>
          f.id === file.id
            ? { ...f, progress: 100, status: "completed", bookId: presignResponse.bookId }
            : f
        )
      );
    } catch (error) {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === file.id
            ? {
                ...f,
                status: "error",
                error: error instanceof Error ? error.message : "Upload failed",
              }
            : f
        )
      );
    }
  };

  const uploadAll = async () => {
    const pendingFiles = files.filter((f) => f.status === "pending");
    for (const file of pendingFiles) {
      await uploadFile(file);
    }
  };

  return (
    <section className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Upload Books</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Drop PDFs, EPUBs, or text files to add them to your library.
        </p>
      </div>

      {/* Drop Zone */}
      <Card>
        <CardContent className="p-6">
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              isDragActive
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-primary/50"
            }`}
          >
            <input {...getInputProps()} />
            <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            {isDragActive ? (
              <p className="text-lg">Drop the files here...</p>
            ) : (
              <div>
                <p className="text-lg mb-2">
                  Drag & drop files here, or click to select
                </p>
                <p className="text-sm text-muted-foreground">
                  Supports PDF, EPUB, and TXT files
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* File List */}
      {files.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">
              Files to Upload ({files.length})
            </h2>
            <Button 
              onClick={uploadAll}
              disabled={files.every((f) => f.status !== "pending")}
            >
              Upload All
            </Button>
          </div>

          <div className="space-y-4">
            {files.map((file) => (
              <Card key={file.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <FileText className="h-8 w-8 text-muted-foreground" />
                      <div>
                        <CardTitle className="text-base">{file.name}</CardTitle>
                        <p className="text-sm text-muted-foreground">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {file.status === "completed" && (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      )}
                      {file.status === "error" && (
                        <AlertCircle className="h-5 w-5 text-red-500" />
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile(file.id)}
                        disabled={file.status === "uploading" || file.status === "processing"}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Metadata Form */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor={`title-${file.id}`}>Title *</Label>
                      <Input
                        id={`title-${file.id}`}
                        value={file.title}
                        onChange={(e) => updateFileMetadata(file.id, "title", e.target.value)}
                        disabled={file.status !== "pending"}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`author-${file.id}`}>Author *</Label>
                      <Input
                        id={`author-${file.id}`}
                        value={file.author}
                        onChange={(e) => updateFileMetadata(file.id, "author", e.target.value)}
                        disabled={file.status !== "pending"}
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor={`description-${file.id}`}>Description</Label>
                    <Textarea
                      id={`description-${file.id}`}
                      value={file.description}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateFileMetadata(file.id, "description", e.target.value)}
                      disabled={file.status !== "pending"}
                      rows={2}
                    />
                  </div>

                  {/* Progress */}
                  {(file.status === "uploading" || file.status === "processing") && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>
                          {file.status === "uploading" ? "Uploading..." : "Processing..."}
                        </span>
                        <span>{file.progress}%</span>
                      </div>
                      <Progress value={file.progress} />
                    </div>
                  )}

                  {/* Error Message */}
                  {file.status === "error" && file.error && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{file.error}</AlertDescription>
                    </Alert>
                  )}

                  {/* Success Message */}
                  {file.status === "completed" && (
                    <Alert>
                      <CheckCircle className="h-4 w-4" />
                      <AlertDescription>
                        Book uploaded successfully! View it in your library.
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Upload Button */}
                  {file.status === "pending" && (
                    <Button 
                      onClick={() => uploadFile(file)}
                      disabled={!file.title.trim() || !file.author.trim()}
                      className="w-full"
                    >
                      Upload This Book
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
