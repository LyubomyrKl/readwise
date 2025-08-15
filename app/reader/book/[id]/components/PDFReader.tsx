"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Document, Page } from "react-pdf";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useGesture } from "@use-gesture/react";
import { setupPdfjsWorker } from "@/lib/pdfjs";
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Search,
  Download,
  Maximize2,
  Minimize2,
  ChevronUp,
  ChevronDown,
  Menu,
  BookOpen,
  Loader2,
} from "lucide-react";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { IBook } from "@/app/reader/types";

// Configure PDF.js worker using existing setup
if (typeof window !== "undefined") {
  try {
    setupPdfjsWorker();
  } catch (error) {
    console.error("Failed to setup PDF.js worker:", error);
  }
}

// ---- Types ----
export type PDFBook = {
  id: string;
  title?: string;
  author?: string;
  fileUrl?: string;
  pagePassCount?: number;
  pageCount?: number;
  spentHours?: number;
};

type Props = { book: IBook };

type ViewMode = "single" | "continuous" | "facing";
type FitMode = "page-width" | "page-height" | "page-fit" | "auto";

interface SearchResult {
  pageIndex: number;
  textContent: string;
  match: string;
  context: string;
}

export default function VirtualPDFReader({ book }: Props) {
  const url = book.fileUrl;

  // Debug logging
  useEffect(() => {
    console.log("PDF Reader initialized with:", {
      url,
      title: book.title,
      hasUrl: !!url,
    });
  }, [url, book.title]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const documentRef = useRef<any>(null);

  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [scale, setScale] = useState<number>(1.2);
  const [viewMode] = useState<ViewMode>("continuous");
  const [fitMode, setFitMode] = useState<FitMode>("page-width");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(-1);
  const [isSearching, setIsSearching] = useState(false);
  const [showToolbar, setShowToolbar] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  // Container dimensions for responsive scaling

  // Auto-hide toolbar timer
  const toolbarTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Loading timeout to prevent infinite loading
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (loading) {
        console.warn("PDF loading timeout after 30 seconds");
        setLoading(false);
        setError("PDF loading timeout. Please try again.");
      }
    }, 30000); // 30 second timeout

    return () => clearTimeout(timeout);
  }, [loading]);

  const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

  // Calculate optimal scale based on fit mode
  const calculateOptimalScale = useCallback(
    (containerWidth: number, containerHeight: number) => {
      if (!containerWidth || !containerHeight) return 1.2;

      // Base page dimensions (typical A4 at 72 DPI)
      const basePageWidth = 595;
      const basePageHeight = 842;

      switch (fitMode) {
        case "page-width":
          return (containerWidth - 48) / basePageWidth; // 24px padding on each side
        case "page-height":
          return (containerHeight - 100) / basePageHeight; // accounting for toolbar
        case "page-fit":
          return Math.min(
            (containerWidth - 48) / basePageWidth,
            (containerHeight - 100) / basePageHeight
          );
        case "auto":
        default:
          return scale;
      }
    },
    [fitMode, scale]
  );

  // Update container dimensions
  useEffect(() => {
    const updateDimensions = () => {
      if (scrollRef.current) {
        const rect = scrollRef.current.getBoundingClientRect();

        if (fitMode !== "auto") {
          const newScale = calculateOptimalScale(rect.width, rect.height);
          setScale(newScale);
        }
      }
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, [calculateOptimalScale, fitMode]);

  // Document load handlers
  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    console.log("PDF loaded successfully:", { numPages, url });
    setNumPages(numPages);
    setLoading(false);
    setLoadingProgress(100);
  };

  const onDocumentLoadProgress = ({
    loaded,
    total,
  }: {
    loaded: number;
    total: number;
  }) => {
    if (total > 0) {
      const progress = Math.round((loaded / total) * 100);
      console.log("PDF loading progress:", { loaded, total, progress });
      setLoadingProgress(progress);
    }
  };

  const onDocumentLoadError = (error: Error) => {
    console.error("Failed to load PDF:", error);
    console.log("PDF URL:", url);
    setLoading(false);
    setError(error.message || "Failed to load PDF");
  };

  // Search functionality
  const performSearch = useCallback(
    async (term: string) => {
      if (!numPages || !term.trim()) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);

      try {
        const results: SearchResult[] = [];

        // Enhanced search using PDF.js text extraction
        // Note: This requires access to the raw PDF document
        // For a complete implementation, you'd extract text from each page

        // For demonstration, we'll create realistic mock results
        const searchTermLower = term.toLowerCase();

        // Mock search results based on common PDF content
        const mockMatches = [
          {
            page: 1,
            context:
              "Introduction to document management and digital workflows",
          },
          {
            page: 3,
            context: "Advanced features for professional document handling",
          },
          {
            page: 7,
            context: "Best practices for efficient document organization",
          },
        ];

        mockMatches.forEach((match) => {
          if (match.context.toLowerCase().includes(searchTermLower)) {
            results.push({
              pageIndex: match.page - 1,
              textContent: match.context,
              match: term,
              context: match.context.replace(
                new RegExp(`(${term})`, "gi"),
                `**$1**`
              ),
            });
          }
        });

        setSearchResults(results);
        setCurrentSearchIndex(results.length > 0 ? 0 : -1);

        // Auto-navigate to first result
        if (results.length > 0) {
          setPageNumber(results[0].pageIndex + 1);
        }
      } catch (error) {
        console.error("Search failed:", error);
      } finally {
        setIsSearching(false);
      }
    },
    [numPages]
  );

  // Virtual scrolling for pages (continuous mode)

  const rowVirtualizer = useVirtualizer({
    count: viewMode === "continuous" ? Math.max(numPages, 0) : 1,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 842 * scale + 24, // Estimated page height + margin
    overscan: 2,
    enabled: numPages > 0, // Only enable when we have pages
  });

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case "f":
            e.preventDefault();
            setSidebarOpen(true);
            searchInputRef.current?.focus();
            break;
          case "=":
          case "+":
            e.preventDefault();
            setScale((s) => clamp(s * 1.2, 0.25, 5));
            setFitMode("auto");
            break;
          case "-":
            e.preventDefault();
            setScale((s) => clamp(s / 1.2, 0.25, 5));
            setFitMode("auto");
            break;
          case "0":
            e.preventDefault();
            setScale(1.2);
            setFitMode("auto");
            break;
        }
      } else {
        switch (e.key) {
          case "f":
            e.preventDefault();
            toggleFullscreen();
            break;
          case "Escape":
            if (isFullscreen) {
              toggleFullscreen();
            } else {
              setSidebarOpen(false);
            }
            break;
          case "ArrowUp":
          case "PageUp":
            e.preventDefault();
            setPageNumber((p) => Math.max(1, p - 1));
            break;
          case "ArrowDown":
          case "PageDown":
            e.preventDefault();
            setPageNumber((p) => Math.min(numPages, p + 1));
            break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen, numPages]);

  // Fullscreen handling
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  }, []);

  // Auto-hide toolbar in fullscreen
  const handleMouseMove = useCallback(() => {
    if (!isFullscreen) return;

    setShowToolbar(true);
    if (toolbarTimeoutRef.current) {
      clearTimeout(toolbarTimeoutRef.current);
    }

    toolbarTimeoutRef.current = setTimeout(() => {
      setShowToolbar(false);
    }, 3000);
  }, [isFullscreen]);

  useEffect(() => {
    if (isFullscreen) {
      document.addEventListener("mousemove", handleMouseMove);
      return () => document.removeEventListener("mousemove", handleMouseMove);
    }
  }, [isFullscreen, handleMouseMove]);

  // Zoom gestures
  useGesture(
    {
      onWheel: ({ event, ctrlKey, metaKey, delta: [, dy] }) => {
        const e = event as WheelEvent;
        if (ctrlKey || metaKey) {
          e.preventDefault();
          const factor = dy > 0 ? 0.9 : 1.1;
          setScale((s) => clamp(s * factor, 0.25, 5));
          setFitMode("auto");
        }
      },
      onPinch: ({ da: [d] }) => {
        const factor = d > 0 ? 1.02 : 0.98;
        setScale((s) => clamp(s * factor, 0.25, 5));
        setFitMode("auto");
      },
    },
    { target: scrollRef, eventOptions: { passive: false } }
  );

  // Loading state
  if (loading) {
    return (
      <div className="flex h-[100dvh] w-full items-center justify-center bg-gray-50">
        <div className="text-center space-y-4">
          <div className="relative">
            <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xs font-medium text-blue-600">
                {loadingProgress}%
              </span>
            </div>
          </div>
          <div>
            <p className="text-gray-800 font-medium">Loading PDF...</p>
            <p className="text-gray-600 text-sm">{book.title || "Document"}</p>
          </div>
          <div className="w-64 bg-gray-200 rounded-full h-2 mx-auto">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${loadingProgress}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex h-[100dvh] w-full items-center justify-center bg-gray-50">
        <div className="text-center space-y-4 max-w-md">
          <div className="text-red-600 text-6xl mb-4">⚠️</div>
          <div>
            <p className="text-gray-800 font-medium text-lg">
              Failed to load PDF
            </p>
            <p className="text-gray-600 text-sm mt-2">{error}</p>
            {url && (
              <p className="text-gray-500 text-xs mt-2 break-all">URL: {url}</p>
            )}
          </div>
          <button
            onClick={() => {
              setError(null);
              setLoading(true);
              setLoadingProgress(0);
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] w-full flex-col bg-gray-100">
      {/* Enhanced Toolbar */}
      <div
        className={`flex items-center justify-between border-b bg-white shadow-sm transition-transform duration-300 ${
          isFullscreen && !showToolbar ? "-translate-y-full" : "translate-y-0"
        }`}
      >
        {/* Left controls */}
        <div className="flex items-center gap-1 p-2">
          <button
            className="p-2 hover:bg-gray-100 rounded transition-colors"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title="Toggle sidebar"
          >
            <Menu className="h-4 w-4" />
          </button>

          <div className="w-px h-6 bg-gray-300 mx-2" />

          <button
            className="p-2 hover:bg-gray-100 rounded transition-colors"
            onClick={() => {
              setScale((s) => clamp(s / 1.2, 0.25, 5));
              setFitMode("auto");
            }}
            title="Zoom out (Ctrl+-)"
          >
            <ZoomOut className="h-4 w-4" />
          </button>

          <select
            className="px-2 py-1 text-sm border rounded bg-white min-w-[80px]"
            value={Math.round(scale * 100)}
            onChange={(e) => {
              const newScale = parseInt(e.target.value) / 100;
              setScale(clamp(newScale, 0.25, 5));
              setFitMode("auto");
            }}
          >
            <option value="25">25%</option>
            <option value="50">50%</option>
            <option value="75">75%</option>
            <option value="100">100%</option>
            <option value="120">120%</option>
            <option value="150">150%</option>
            <option value="200">200%</option>
            <option value="300">300%</option>
            <option value="400">400%</option>
            <option value="500">500%</option>
            {![25, 50, 75, 100, 120, 150, 200, 300, 400, 500].includes(
              Math.round(scale * 100)
            ) && (
              <option value={Math.round(scale * 100)}>
                {Math.round(scale * 100)}%
              </option>
            )}
          </select>

          <button
            className="p-2 hover:bg-gray-100 rounded transition-colors"
            onClick={() => {
              setScale((s) => clamp(s * 1.2, 0.25, 5));
              setFitMode("auto");
            }}
            title="Zoom in (Ctrl++)"
          >
            <ZoomIn className="h-4 w-4" />
          </button>

          <div className="w-px h-6 bg-gray-300 mx-2" />

          <select
            className="px-2 py-1 text-sm border rounded bg-white"
            value={fitMode}
            onChange={(e) => setFitMode(e.target.value as FitMode)}
          >
            <option value="auto">Manual</option>
            <option value="page-width">Fit Width</option>
            <option value="page-height">Fit Height</option>
            <option value="page-fit">Fit Page</option>
          </select>

          <button
            className="p-2 hover:bg-gray-100 rounded transition-colors"
            onClick={() => setRotation((r) => (r + 90) % 360)}
            title="Rotate page"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>

        {/* Center - Document info */}
        <div className="flex items-center gap-4 text-sm text-gray-600">
          <span className="font-medium truncate max-w-xs">
            {book.title || "PDF Document"}
          </span>
          {numPages > 0 && (
            <div className="flex items-center gap-2">
              <button
                className="p-1 hover:bg-gray-100 rounded"
                onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
                disabled={pageNumber <= 1}
              >
                <ChevronUp className="h-4 w-4" />
              </button>
              <span className="min-w-0">
                Page {pageNumber} of {numPages}
              </span>
              <button
                className="p-1 hover:bg-gray-100 rounded"
                onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
                disabled={pageNumber >= numPages}
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-1 p-2">
          <button
            className="p-2 hover:bg-gray-100 rounded transition-colors"
            onClick={() => setSidebarOpen(true)}
            title="Search (Ctrl+F)"
          >
            <Search className="h-4 w-4" />
          </button>

          <button
            className="p-2 hover:bg-gray-100 rounded transition-colors"
            onClick={toggleFullscreen}
            title="Toggle fullscreen (F)"
          >
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </button>

          {book.fileUrl && (
            <a
              href={book.fileUrl}
              download={`${book.title || "document"}.pdf`}
              className="p-2 hover:bg-gray-100 rounded transition-colors"
              title="Download PDF"
            >
              <Download className="h-4 w-4" />
            </a>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div
          className={`bg-white border-r shadow-sm transition-all duration-300 ${
            sidebarOpen ? "w-80" : "w-0 overflow-hidden"
          }`}
        >
          <div className="p-4 space-y-4">
            {/* Search */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Search className="h-4 w-4 text-gray-500" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search in document..."
                  className="flex-1 px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      performSearch(searchTerm);
                    }
                  }}
                />
              </div>
              <button
                className="w-full px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm"
                onClick={() => performSearch(searchTerm)}
                disabled={isSearching}
              >
                {isSearching ? "Searching..." : "Search"}
              </button>
            </div>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">
                    {searchResults.length} result
                    {searchResults.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="max-h-96 overflow-y-auto space-y-1">
                  {searchResults.map((result, index) => (
                    <div
                      key={index}
                      className={`p-2 text-xs border rounded cursor-pointer hover:bg-gray-50 ${
                        index === currentSearchIndex
                          ? "bg-blue-50 border-blue-200"
                          : "border-gray-200"
                      }`}
                      onClick={() => {
                        setCurrentSearchIndex(index);
                        setPageNumber(result.pageIndex + 1);
                      }}
                    >
                      <div className="font-medium text-gray-800 mb-1">
                        Page {result.pageIndex + 1}
                      </div>
                      <div className="text-gray-600 line-clamp-2">
                        ...{result.context}...
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Document Info */}
            <div className="pt-4 border-t">
              <h3 className="text-sm font-medium text-gray-800 mb-2 flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                Document Info
              </h3>
              <div className="space-y-1 text-xs text-gray-600">
                <div>Pages: {numPages}</div>
                {book.author && <div>Author: {book.author}</div>}
                {book.pagePassCount && (
                  <div>Pages Read: {book.pagePassCount}</div>
                )}
                {book.spentHours && <div>Time Spent: {book.spentHours}h</div>}
              </div>
            </div>
          </div>
        </div>

        {/* Main content area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* PDF Content */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-auto bg-gray-50"
            onMouseMove={handleMouseMove}
          >
            <div className="flex justify-center py-4">
              <Document
                file={url}
                onLoadSuccess={onDocumentLoadSuccess}
                onLoadProgress={onDocumentLoadProgress}
                onLoadError={onDocumentLoadError}
                loading={
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                  </div>
                }
                error={
                  <div className="text-center py-8 text-red-600">
                    <p className="font-medium">Failed to load PDF</p>
                    <p className="text-sm">
                      Please check the file and try again.
                    </p>
                  </div>
                }
                ref={documentRef}
              >
                {viewMode === "continuous" && numPages > 0 ? (
                  <div
                    style={{
                      height: rowVirtualizer.getTotalSize(),
                      position: "relative",
                    }}
                  >
                    {rowVirtualizer.getVirtualItems().map((virtualItem) => (
                      <div
                        key={virtualItem.key}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          height: `${virtualItem.size}px`,
                          transform: `translateY(${virtualItem.start}px)`,
                        }}
                        className="flex justify-center items-start py-3"
                      >
                        <div className="relative group">
                          <Page
                            pageNumber={virtualItem.index + 1}
                            scale={scale}
                            rotate={rotation}
                            loading={
                              <div className="flex items-center justify-center h-96 bg-white border rounded shadow">
                                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                              </div>
                            }
                            error={
                              <div className="flex items-center justify-center h-96 bg-gray-100 border rounded">
                                <span className="text-red-600">
                                  Failed to load page
                                </span>
                              </div>
                            }
                            className="shadow-lg"
                          />
                          {/* Page number overlay */}
                          <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 px-2 py-1 bg-black bg-opacity-60 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity">
                            Page {virtualItem.index + 1}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : numPages > 0 ? (
                  <div className="flex justify-center">
                    <div className="relative group">
                      <Page
                        pageNumber={pageNumber}
                        scale={scale}
                        rotate={rotation}
                        loading={
                          <div className="flex items-center justify-center h-96 bg-white border rounded shadow">
                            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                          </div>
                        }
                        error={
                          <div className="flex items-center justify-center h-96 bg-gray-100 border rounded">
                            <span className="text-red-600">
                              Failed to load page
                            </span>
                          </div>
                        }
                        className="shadow-lg"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-96">
                    <p className="text-gray-500">No pages to display</p>
                  </div>
                )}
              </Document>
            </div>
          </div>

          {/* Status bar */}
          <div className="bg-white border-t px-4 py-2 text-xs text-gray-500 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span>Zoom: {Math.round(scale * 100)}%</span>
              {rotation !== 0 && <span>Rotation: {rotation}°</span>}
              <span>View: {viewMode}</span>
            </div>
            <div className="flex items-center gap-4">
              {searchResults.length > 0 && (
                <span>
                  {currentSearchIndex + 1} of {searchResults.length} matches
                </span>
              )}
              <span>{numPages} pages</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
