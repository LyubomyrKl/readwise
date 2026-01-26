"use client";

import { useState, useRef } from "react";
import {
  BookOpen,
  Clock,
  Calendar,
  User,
  FileText,
  Heart,
  Download,
  Share2,
  MoreHorizontal,
  Tag,
  Bookmark,
  Eye,
  ArrowLeft,
  Award,
  TrendingUp,
  Upload,
  Camera,
  Sparkles,
} from "lucide-react";
import { IBook } from "@/app/reader/types";
import { apiFetch } from "@/lib/fetcher";

interface BookProfileProps {
  book: IBook;
  onStartReading: () => void;
  onBack: () => void;
}

export default function BookProfile({
  book,
  onStartReading,
  onBack,
}: BookProfileProps) {
  const [isFavorite, setIsFavorite] = useState(book.isFavorite);
  const [showAllTags, setShowAllTags] = useState(false);
  const [coverUrl, setCoverUrl] = useState(book.coverUrl);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(
    book.status === "processing"
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatFileSize = (bytes: string) => {
    const size = parseInt(bytes);
    if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(1)} KB`;
    }
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatMimeType = (mime: string) => {
    if (mime === "application/pdf") return "PDF";
    if (mime === "application/epub+zip") return "EPUB";
    if (mime === "text/plain") return "TXT";
    return mime.split("/").pop()?.toUpperCase() || "Unknown";
  };

  const readingTimeHours = Math.floor(book.spentTime);
  const readingTimeMinutes = Math.round(
    (book.spentTime - readingTimeHours) * 60
  );

  const handleCoverUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      alert("Please select an image file");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert("File size must be less than 5MB");
      return;
    }

    setIsUploadingCover(true);

    // Create a preview URL immediately
    const previewUrl = URL.createObjectURL(file);
    setCoverUrl(previewUrl);

    try {
      // Step 1: Get presigned URL for cover upload
      const presignData = await apiFetch("POST", "/api/books/coverPresign", {
        bookId: book.id,
        filename: file.name,
        mime: file.type,
      });

      // Step 2: Upload file to presigned URL (raw fetch for S3)
      const uploadResponse = await fetch(presignData.upload.url, {
        method: "PUT",
        headers: presignData.upload.headers,
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error("Failed to upload cover");
      }

      // Step 3: Finalize the cover upload with the new route
      await apiFetch("POST", "/api/books/updateCoverFinalize", {
        bookId: book.id,
        storageKey: presignData.storageKey,
      });

      // Clean up the preview URL since upload is complete
      URL.revokeObjectURL(previewUrl);

      // The cover URL will be updated when the book data is refetched
      // For now, keep the preview URL as the cover
    } catch (error) {
      console.error("Error uploading cover:", error);
      alert("Failed to upload cover. Please try again.");
      setCoverUrl(book.coverUrl); // Revert to original
      URL.revokeObjectURL(previewUrl); // Clean up
    } finally {
      setIsUploadingCover(false);
    }
  };

  const handleCoverClick = () => {
    fileInputRef.current?.click();
  };

  const handleSummarize = async () => {
    try {
      await apiFetch("POST", "/api/summarizer", {
        bookId: book.id,
      });

      setIsGeneratingSummary(true);
    } catch (error) {
      console.error("Error generating summary:", error);
      alert("Failed to generate summary. Please try again.");
    }
  };

  // @ts-ignore
    return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={onBack}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="text-sm">Back to Library</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsFavorite(!isFavorite)}
                className={`p-2 rounded-lg transition-colors ${
                  isFavorite
                    ? "text-red-500 bg-red-50 hover:bg-red-100"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <Heart
                  className={`h-4 w-4 ${isFavorite ? "fill-current" : ""}`}
                />
              </button>

              <button className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                <Share2 className="h-4 w-4" />
              </button>

              <button className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Book Cover & Actions */}
          <div className="lg:col-span-1">
            <div className="sticky top-24">
              {/* Cover with Format Badge */}
              <div
                className="relative aspect-[3/4] bg-muted rounded-2xl overflow-hidden shadow-lg mb-6 group cursor-pointer"
                onClick={handleCoverClick}
              >
                {coverUrl ? (
                  <img
                    src={coverUrl}
                    alt={`${book.title} cover`}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 via-muted to-muted/50">
                    <div className="text-center">
                      <BookOpen className="h-16 w-16 text-muted-foreground/30 mx-auto mb-2" />
                      <div className="text-xs text-muted-foreground/50 uppercase tracking-wide">
                        {formatMimeType(book.mime)} Book
                      </div>
                    </div>
                  </div>
                )}

                {/* Format Badge */}
                <div className="absolute top-3 right-3">
                  <div className="bg-background/90 backdrop-blur-sm px-2 py-1 rounded-full text-xs font-medium border shadow-sm">
                    {formatMimeType(book.mime)}
                  </div>
                </div>

                {/* Size Indicator */}
                <div className="absolute bottom-3 left-3">
                  <div className="bg-background/90 backdrop-blur-sm px-2 py-1 rounded-full text-xs text-muted-foreground border shadow-sm">
                    {formatFileSize(book.sizeBytes)}
                  </div>
                </div>

                {/* Upload Overlay */}
                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                  <div className="flex gap-3">
                    <div className="bg-background/90 backdrop-blur-sm px-3 py-2 rounded-lg text-sm font-medium border shadow-lg hover:bg-background/95 transition-colors">
                      <Camera className="h-4 w-4 inline mr-2" />
                      Change Cover
                    </div>
                  </div>
                </div>

                {/* Loading State */}
                {isUploadingCover && (
                  <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center">
                    <div className="flex items-center gap-2 text-sm">
                      <Upload className="h-4 w-4 animate-pulse" />
                      Uploading...
                    </div>
                  </div>
                )}
              </div>

              {/* Hidden File Input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleCoverUpload}
                className="hidden"
              />

              {/* Primary Actions */}
              <div className="space-y-3 mb-6">
                <button
                  onClick={onStartReading}
                  className="w-full bg-primary text-primary-foreground px-6 py-3 rounded-xl font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                >
                  <BookOpen className="h-4 w-4" />
                  {book.spentTime > 0 ? "Continue Reading" : "Start Reading"}
                </button>

                <div className="grid grid-cols-2 gap-3">
                  <a
                    href={book.fileUrl}
                    download
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-muted hover:bg-muted/80 rounded-lg transition-colors text-sm"
                  >
                    <Download className="h-4 w-4" />
                    Download
                  </a>

                  <button className="flex items-center justify-center gap-2 px-4 py-2 bg-muted hover:bg-muted/80 rounded-lg transition-colors text-sm">
                    <Bookmark className="h-4 w-4" />
                    {book.highlights.length} Notes
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-2">
                  {book.summaryKey ? (
                    <button
                      onClick={() =>
                        (window.location.href = `/reader/book/${book.id}/summary`)
                      }
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-lg transition-all duration-300 text-sm font-medium"
                    >
                      <Sparkles className="h-4 w-4" />
                      View Summary
                    </button>
                  ) : (
                    <button
                      onClick={handleSummarize}
                      disabled={isGeneratingSummary}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:from-gray-400 disabled:to-gray-500 text-white rounded-lg transition-all duration-300 text-sm font-medium disabled:cursor-not-allowed"
                    >
                      <Sparkles
                        className={`h-4 w-4 ${
                          isGeneratingSummary ? "animate-spin" : ""
                        }`}
                      />
                      {isGeneratingSummary
                        ? "Generating Summary..."
                        : "Generate Summary"}
                    </button>
                  )}
                </div>
              </div>

              {/* Quick Stats */}
              <div className="bg-muted/30 rounded-xl p-4 space-y-3">
                <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                  Reading Progress
                </h3>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Progress</span>
                    <span className="font-medium">
                      {book.isFinished
                        ? "100%"
                        : `${Math.round(
                            (book.pagePassCount / (Number(book.pageCount) || 1)) * 100
                          )}%`}
                    </span>
                  </div>

                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full transition-all duration-300"
                      style={{
                        width: book.isFinished
                          ? "100%"
                          : `${Math.round(
                              (book.pagePassCount / (Number(book.pageCount) || 1)) * 100
                            )}%`,
                      }}
                    />
                  </div>

                  {book.pageCount && (
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Page {book.pagePassCount}</span>
                      <span>of {Number(book.pageCount)}</span>
                    </div>
                  )}
                </div>

                {book.spentTime > 0 && (
                  <div className="pt-2 border-t border-muted">
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {readingTimeHours > 0 && `${readingTimeHours}h `}
                        {readingTimeMinutes}m read
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Book Details */}
          <div className="lg:col-span-2 space-y-8">
            {/* Title & Author */}
            <div>
              <h1 className="text-3xl font-bold mb-3 leading-tight">
                {book.title}
              </h1>

              {/* Enhanced Author Section */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-primary/20 to-primary/5 rounded-full flex items-center justify-center">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="text-lg font-medium">{book.author}</div>
                  <div className="text-sm text-muted-foreground">Author</div>
                </div>
              </div>

              {/* Status Badges */}
              <div className="flex flex-wrap gap-2 mb-4">
                {book.isFinished && (
                  <div className="inline-flex items-center gap-2 bg-green-50 text-green-700 px-3 py-1 rounded-full text-sm">
                    <Award className="h-3 w-3 fill-current" />
                    Completed
                  </div>
                )}

                {book.isFavorite && (
                  <div className="inline-flex items-center gap-2 bg-red-50 text-red-600 px-3 py-1 rounded-full text-sm">
                    <Heart className="h-3 w-3 fill-current" />
                    Favorite
                  </div>
                )}

                {book.spentTime > 0 && (
                  <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm">
                    <TrendingUp className="h-3 w-3" />
                    In Progress
                  </div>
                )}
              </div>
            </div>

            {/* Metadata Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="text-sm text-muted-foreground">Format</div>
                    <div className="font-medium">
                      {formatMimeType(book.mime)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Download className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="text-sm text-muted-foreground">
                      File Size
                    </div>
                    <div className="font-medium">
                      {formatFileSize(book.sizeBytes)}
                    </div>
                  </div>
                </div>

                {book.pageCount && (
                  <div className="flex items-center gap-3">
                    <BookOpen className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-sm text-muted-foreground">Pages</div>
                      <div className="font-medium">{Number(book.pageCount)}</div>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="text-sm text-muted-foreground">Added</div>
                    <div className="font-medium">
                      {formatDate(book.createdAt)}
                    </div>
                  </div>
                </div>

                {book.lastAccessed && (
                  <div className="flex items-center gap-3">
                    <Eye className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-sm text-muted-foreground">
                        Last Read
                      </div>
                      <div className="font-medium">
                        {formatDate(book.lastAccessed as unknown as string)}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <Bookmark className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="text-sm text-muted-foreground">
                      Highlights
                    </div>
                    <div className="font-medium">{book.highlights.length}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Tags */}
            {book.tags.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Tag className="h-4 w-4 text-muted-foreground" />
                  <h3 className="font-medium">Tags</h3>
                </div>

                <div className="flex flex-wrap gap-2">
                  {/*{(showAllTags ? book.tags : book.tags.slice(0, 5)).map(*/}
                  {/*  (tag) => (*/}
                  {/*    <span*/}
                  {/*      key={tag.tagId}*/}
                  {/*      className="inline-flex items-center gap-1 px-3 py-1 bg-muted rounded-full text-sm"*/}
                  {/*      style={{*/}
                  {/*        backgroundColor: tag.color*/}
                  {/*          ? `${tag.color}20`*/}
                  {/*          : undefined,*/}
                  {/*        color: tag.color || undefined,*/}
                  {/*      }}*/}
                  {/*    >*/}
                  {/*      /!*{tag.color && (*!/*/}
                  {/*      /!*  <div*!/*/}
                  {/*      /!*    className="w-2 h-2 rounded-full"*!/*/}
                  {/*      /!*    style={{ backgroundColor: tag.color }}*!/*/}
                  {/*      /!*  />*!/*/}
                  {/*      /!*)}*!/*/}
                  {/*      {tag.}*/}
                  {/*    </span>*/}
                  {/*  )*/}
                  {/*)}*/}

                  {book.tags.length > 5 && (
                    <button
                      onClick={() => setShowAllTags(!showAllTags)}
                      className="px-3 py-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showAllTags
                        ? "Show less"
                        : `+${book.tags.length - 5} more`}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Reading Statistics */}
            <div>
              <h3 className="font-medium mb-4 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                Reading Statistics
              </h3>

              <div className="bg-muted/30 rounded-xl p-6 space-y-6">
                <div className="grid grid-cols-3 gap-6">
                  {/* Reading Time */}
                  <div className="text-center">
                    <div className="text-2xl font-bold mb-1">
                      {readingTimeHours > 0
                        ? `${readingTimeHours}h`
                        : `${readingTimeMinutes}m`}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Time Spent
                    </div>
                  </div>

                  {/* Sessions */}
                  <div className="text-center border-x border-muted">
                    <div className="text-2xl font-bold mb-1">
                      {Math.max(1, Math.floor(book.spentTime / 0.5))}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Sessions
                    </div>
                  </div>

                  {/* Average */}
                  <div className="text-center">
                    <div className="text-2xl font-bold mb-1">
                      {Math.round(
                        (book.spentTime /
                          Math.max(1, Math.floor(book.spentTime / 0.5))) *
                          60
                      )}
                      m
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Avg Session
                    </div>
                  </div>
                </div>

                {/* Progress Graph */}
                <div className="pt-4 border-t border-muted">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium">
                      Reading Progress
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Last 7 days
                    </span>
                  </div>
                  <div className="flex items-end gap-2 h-12">
                    {Array.from({ length: 7 }, (_, i) => {
                      const baseProgress =
                        (book.pagePassCount / (Number(book.pageCount) || 1)) * 100;
                      const dailyVariation = (Math.sin(i * 0.5) + 1) * 20;
                      const height = Math.min(
                        100,
                        Math.max(5, baseProgress + dailyVariation - 40)
                      );
                      return (
                        <div
                          key={i}
                          className="bg-muted-foreground/20 rounded-sm flex-1 transition-all duration-300 hover:bg-muted-foreground/40"
                          style={{ height: `${height}%` }}
                        />
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground mt-2">
                    <span>M</span>
                    <span>T</span>
                    <span>W</span>
                    <span>T</span>
                    <span>F</span>
                    <span>S</span>
                    <span>S</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Notes Preview */}
            {book.notes.length > 0 && (
              <div>
                <h3 className="font-medium mb-4 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  Recent Notes
                </h3>

                <div className="space-y-3">
                  {book.notes.slice(0, 3).map((note) => (
                    <div key={note.id} className="bg-muted/30 rounded-lg p-4">
                      <p className="text-sm line-clamp-3 mb-2">{note.body}</p>
                      <div className="text-xs text-muted-foreground">
                        {note.isPinned && (
                          <span className="inline-flex items-center gap-1 mr-2">
                            <Bookmark className="h-3 w-3 fill-current" />
                            Pinned
                          </span>
                        )}
                      </div>
                    </div>
                  ))}

                  {book.notes.length > 3 && (
                    <button className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                      View all {book.notes.length} notes →
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
