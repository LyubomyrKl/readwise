"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
  Sparkles,
  Loader2,
  Trash2,
} from "lucide-react";
import { IBook } from "@/app/reader/types";
import { apiFetch } from "@/lib/fetcher";
import { useBookMutations } from "@/hooks/useBookMutations";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

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
  const router = useRouter();
  const [isFavorite, setIsFavorite] = useState(book.isFavorite);
  const [isPending, startTransition] = useTransition();
  const [isDeleting, setIsDeleting] = useState(false);
  const [showAllTags, setShowAllTags] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(
    book.status === "processing"
  );

  const { setFavorite, deleteBook } = useBookMutations({
    onError: () => {
      // Revert optimistic update on error
      setIsFavorite(!isFavorite);
      toast.error("Failed to update favorite status");
    },
  });

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteBook(book.id, () => {
        toast.success("Book deleted successfully");
        router.push("/library");
      });
    } catch {
      toast.error("Failed to delete book");
      setIsDeleting(false);
    }
  };

  const handleFavoriteToggle = () => {
    const newValue = !isFavorite;
    // Optimistic update
    setIsFavorite(newValue);

    startTransition(async () => {
      await setFavorite(book.id, newValue);
    });
  };

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
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
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
                onClick={handleFavoriteToggle}
                disabled={isPending}
                className={`p-2 rounded-lg transition-colors ${
                  isFavorite
                    ? "text-red-500 bg-red-50 hover:bg-red-100 dark:bg-red-950 dark:hover:bg-red-900"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                } disabled:opacity-50`}
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Heart
                    className={`h-4 w-4 ${isFavorite ? "fill-current" : ""}`}
                  />
                )}
              </button>

              <button className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                <Share2 className="h-4 w-4" />
              </button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    disabled={isDeleting}
                    className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                  >
                    {isDeleting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Book</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete &quot;{book.title}&quot;? This action cannot be undone. All notes, highlights, and reading progress will be permanently removed.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDelete}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <button className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-8">
          {/* Book Cover & Actions */}
          <div className="lg:col-span-1">
            <div className="sticky top-24">
              {/* Cover with Format Badge */}
              <div
                className="relative aspect-[3/4] bg-muted rounded-2xl overflow-hidden shadow-lg mb-6"
              >
                {book.coverUrl ? (
                  <img
                    src={book.coverUrl}
                    alt={`${book.title} cover`}
                    className="w-full h-full object-cover"
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
              </div>

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
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold mb-2 sm:mb-3 leading-tight">
                {book.title}
              </h1>

              {/* Enhanced Author Section */}
              <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-primary/20 to-primary/5 rounded-full flex items-center justify-center">
                  <User className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                </div>
                <div>
                  <div className="text-base sm:text-lg font-medium">{book.author}</div>
                  <div className="text-xs sm:text-sm text-muted-foreground">Author</div>
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
            <div className="grid grid-cols-2 gap-3 sm:gap-6">
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

              <div className="bg-muted/30 rounded-xl p-4 sm:p-6 space-y-4 sm:space-y-6">
                <div className="grid grid-cols-3 gap-2 sm:gap-6">
                  {/* Reading Time */}
                  <div className="text-center">
                    <div className="text-lg sm:text-2xl font-bold mb-1">
                      {readingTimeHours > 0
                        ? `${readingTimeHours}h`
                        : `${readingTimeMinutes}m`}
                    </div>
                    <div className="text-[10px] sm:text-xs text-muted-foreground">
                      Time Spent
                    </div>
                  </div>

                  {/* Sessions */}
                  <div className="text-center border-x border-muted">
                    <div className="text-lg sm:text-2xl font-bold mb-1">
                      {Math.max(1, Math.floor(book.spentTime / 0.5))}
                    </div>
                    <div className="text-[10px] sm:text-xs text-muted-foreground">
                      Sessions
                    </div>
                  </div>

                  {/* Average */}
                  <div className="text-center">
                    <div className="text-lg sm:text-2xl font-bold mb-1">
                      {Math.round(
                        (book.spentTime /
                          Math.max(1, Math.floor(book.spentTime / 0.5))) *
                          60
                      )}
                      m
                    </div>
                    <div className="text-[10px] sm:text-xs text-muted-foreground">
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
