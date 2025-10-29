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
import { useUpload, UploadFile } from "@/app/(providers)/UploadProvider";

interface PendingFile {
  id: string;
  file: File;
  title: string;
  author: string;
  description: string;
  coverFile?: File;
  coverPreview?: string;
}

export default function UploadPage() {
  const { uploads, addUploads, removeUpload } = useUpload();

  // Local state for files before upload
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);

  // Filter uploads to show only those from this session
  const [sessionUploads, setSessionUploads] = useState<string[]>([]);
  const currentUploads = uploads.filter((upload) =>
    sessionUploads.includes(upload.id)
  );

  const onDrop = useCallback((acceptedFiles: File[]) => {
    // Add files to local pending state for editing
    const newPendingFiles: PendingFile[] = acceptedFiles.map((file) => {
      const fileName = file.name;
      const baseName = fileName.replace(/\.[^/.]+$/, "");


      return {
        id: crypto.randomUUID(),
        file,
        title: baseName,
        author: "",
        description: "",
      };
    });

    setPendingFiles((prev) => [...prev, ...newPendingFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "application/epub+zip": [".epub"],
      "application/epub": [".epub"], // Alternative MIME type for EPUB
      "application/x-mobipocket-ebook": [".epub"], // Some browsers report this
      "text/plain": [".txt"],
    },
    multiple: true,
    validator: (file) => {
      const fileName = file.name.toLowerCase();
      const allowedExtensions = [".pdf", ".epub", ".txt"];
      const hasValidExtension = allowedExtensions.some((ext) =>
        fileName.endsWith(ext)
      );

      if (!hasValidExtension) {
        return {
          code: "invalid-file-type",
          message: "Only PDF, EPUB, and TXT files are allowed",
        };
      }
      return null; // No errors
    },
  });

  const removePendingFile = (fileId: string) => {
    setPendingFiles((prev) => prev.filter((file) => file.id !== fileId));
  };

  const removeUploadedFile = (fileId: string) => {
    removeUpload(fileId);
    setSessionUploads((prev) => prev.filter((id) => id !== fileId));
  };

  const updatePendingFile = (
    fileId: string,
    field: keyof PendingFile,
    value: string | File
  ) => {
    setPendingFiles((prev) =>
      prev.map((file) =>
        file.id === fileId ? { ...file, [field]: value } : file
      )
    );
  };

  const handleCoverUpload = (fileId: string, coverFile: File) => {
    const coverPreview = URL.createObjectURL(coverFile);
    setPendingFiles((prev) =>
      prev.map((file) =>
        file.id === fileId ? { ...file, coverFile, coverPreview } : file
      )
    );
  };

  const uploadFile = async (pendingFile: PendingFile) => {
    // Determine MIME type, with fallback for EPUB files
    let mimeType = pendingFile.file.type;
    const fileName = pendingFile.file.name.toLowerCase();

    console.log("uploadFile", pendingFile.file);

    if (
      fileName.endsWith(".epub") &&
      (!mimeType || mimeType === "application/octet-stream")
    ) {
      mimeType = "application/epub+zip";
      console.log("Fallback MIME type applied for EPUB:", mimeType);
    } else if (
      fileName.endsWith(".pdf") &&
      (!mimeType || mimeType === "application/octet-stream")
    ) {
      mimeType = "application/pdf";
    } else if (
      fileName.endsWith(".txt") &&
      (!mimeType || mimeType === "application/octet-stream")
    ) {
      mimeType = "text/plain";
    }

    console.log(
      "Uploading file with MIME type:",
      mimeType,
      "for file:",
      fileName
    );

    const uploadFile: UploadFile = {
      title: pendingFile.title,
      author: pendingFile.author,
      description: pendingFile.description,
      fileName: pendingFile.file.name,
      mime: mimeType,
      sizeBytes: pendingFile.file.size,
      file: pendingFile.file,
      ...(pendingFile.coverFile && {
        customCoverFilename: pendingFile.coverFile.name,
        customCoverMime: pendingFile.coverFile.type,
        customCoverSizeBytes: pendingFile.coverFile.size,
        coverFile: pendingFile.coverFile,
      }),
    };

    addUploads([uploadFile]);

    // Track this upload and remove from pending
    setTimeout(() => {
      const newUploads = uploads.filter(
        (upload) => upload.name === pendingFile.file.name
      );
      setSessionUploads((prev) => [...prev, ...newUploads.map((u) => u.id)]);
    }, 100);

    removePendingFile(pendingFile.id);
  };

  const uploadAll = async () => {
    const validFiles = pendingFiles.filter(
      (file) =>
        file.title.trim() && file.author.trim() && file.description.trim()
    );

    for (const file of validFiles) {
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

      {/* Pending Files for Editing */}
      {pendingFiles.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">
              Files to Upload ({pendingFiles.length})
            </h2>
            <Button
              onClick={uploadAll}
              disabled={
                !pendingFiles.some(
                  (f) =>
                    f.title.trim() && f.author.trim() && f.description.trim()
                )
              }
            >
              Upload All
            </Button>
          </div>

          <div className="space-y-4">
            {pendingFiles.map((file) => (
              <Card key={file.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <FileText className="h-8 w-8 text-muted-foreground" />
                      <div>
                        <CardTitle className="text-base">
                          {file.file.name}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">
                          {(file.file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removePendingFile(file.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Cover Upload/Preview */}
                  <div className="flex justify-center">
                    <div className="relative w-24 h-32 rounded-lg overflow-hidden border bg-muted">
                      {file.coverPreview ? (
                        <img
                          src={file.coverPreview}
                          alt={`${file.title} cover`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <FileText className="h-8 w-8 text-muted-foreground" />
                        </div>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const coverFile = e.target.files?.[0];
                          if (coverFile) {
                            handleCoverUpload(file.id, coverFile);
                          }
                        }}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Metadata Form */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor={`title-${file.id}`}>Title *</Label>
                      <Input
                        id={`title-${file.id}`}
                        value={file.title}
                        onChange={(e) =>
                          updatePendingFile(file.id, "title", e.target.value)
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor={`author-${file.id}`}>Author *</Label>
                      <Input
                        id={`author-${file.id}`}
                        value={file.author}
                        onChange={(e) =>
                          updatePendingFile(file.id, "author", e.target.value)
                        }
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor={`description-${file.id}`}>
                      Description *
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
                      rows={2}
                    />
                  </div>

                  {/* Upload Button */}
                  <Button
                    onClick={() => uploadFile(file)}
                    disabled={
                      !file.title.trim() ||
                      !file.author.trim() ||
                      !file.description.trim()
                    }
                    className="w-full"
                  >
                    Upload This Book
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Upload Status */}
      {currentUploads.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-medium">
            Upload Status ({currentUploads.length})
          </h2>

          <div className="space-y-4">
            {currentUploads.map((file) => (
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
                      {file.status === "uploading" && (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                      )}
                      {file.status === "processing" && (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeUploadedFile(file.id)}
                        disabled={
                          file.status === "uploading" ||
                          file.status === "processing"
                        }
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Status Display */}
                  <div className="flex items-center justify-center py-4">
                    <div className="text-center">
                      <div className="text-lg font-medium mb-2">
                        {file.status === "pending" && "Preparing..."}
                        {file.status === "processing" && "Processing..."}
                        {file.status === "uploading" && "Uploading..."}
                        {file.status === "completed" &&
                          "Successfully uploaded!"}
                        {file.status === "error" && "Upload failed"}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Title: {file.title}
                      </div>
                    </div>
                  </div>

                  {/* Progress */}
                  {(file.status === "uploading" ||
                    file.status === "processing") && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>
                          {file.status === "uploading"
                            ? "Uploading..."
                            : "Processing..."}
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
                        Book uploaded and finalized successfully! View it in
                        your library.
                      </AlertDescription>
                    </Alert>
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
