"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useGesture } from "@use-gesture/react";
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
  ChevronLeft,
  ChevronRight,
  StickyNote,
  Trash2,
} from "lucide-react";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { IBook } from "@/app/reader/types";
import { setupPdfjsWorker } from "@/lib/pdfjs";

// Configure PDF.js worker (ensure /public/pdf.worker.mjs exists or your own path)
if (typeof window !== "undefined") {
  try {
    setupPdfjsWorker(); // Your existing helper, e.g. pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.mjs"
  } catch (err) {
    // fallback if helper missing
    // @ts-ignore
    if (pdfjs?.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.mjs";
    }
  }
}

// ---- Types ----
type Props = { book: IBook };
type ViewMode = "single" | "continuous";
type FitMode = "page-width" | "page-height" | "page-fit" | "auto";

interface SearchResult {
  pageIndex: number;
  matchText: string;
  context: string;
}

type NormalizedRect = { x: number; y: number; w: number; h: number };

interface NoteItem {
  id: string;
  pageIndex: number;
  quote: string;
  rects: NormalizedRect[];
  comment: string;
  color?: string; // optional future theming
}

export default function VirtualPDFReader({ book }: Props) {
  const url = book.fileUrl ?? "";

  console.log("url:", url);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const [pdfDoc, setPdfDoc] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [scale, setScale] = useState<number>(1.2);
  const [viewMode] = useState<ViewMode>("continuous");
  const [fitMode, setFitMode] = useState<FitMode>("page-width");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(-1);
  const [isSearching, setIsSearching] = useState(false);
  const [showToolbar, setShowToolbar] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  // Notes state
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [pendingSelection, setPendingSelection] = useState<{
    pageIndex: number;
    rects: NormalizedRect[];
    quote: string;
    anchorPx: { x: number; y: number }; // relative to page box
  } | null>(null);
  const [addNoteText, setAddNoteText] = useState("");

  // Map pageIndex -> wrapper div for positioning overlays
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Reset state when URL changes
  useEffect(() => {
    console.log("PDF Reader init", { url, title: book.title });
    if (url) {
      setLoading(true);
      setError(null);
      setLoadingProgress(0);
      setNumPages(0);
      setPdfDoc(null);
      setPageNumber(1);
    }
  }, [url, book.title]);

  // Auto-hide toolbar in fullscreen
  const toolbarTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const handleMouseMove = useCallback(() => {
    if (!isFullscreen) return;
    setShowToolbar(true);
    if (toolbarTimeoutRef.current) clearTimeout(toolbarTimeoutRef.current);
    toolbarTimeoutRef.current = setTimeout(() => setShowToolbar(false), 2000);
  }, [isFullscreen]);

  useEffect(() => {
    if (!isFullscreen) return;
    const el = scrollRef.current ?? document;
    el.addEventListener("mousemove", handleMouseMove);
    return () => el.removeEventListener("mousemove", handleMouseMove);
  }, [isFullscreen, handleMouseMove]);

  // Loading timeout safety
  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => {
      if (loading) {
        console.warn("PDF loading timeout after 30 seconds");
        setLoading(false);
        setError(
          "PDF loading timeout. Please try again or check the file URL."
        );
      }
    }, 30000);
    return () => clearTimeout(t);
  }, [loading]);

  const clamp = (v: number, min: number, max: number) =>
    Math.min(Math.max(v, min), max);

  // Scale based on fit mode and container
  const calculateOptimalScale = useCallback(
    (containerWidth: number, containerHeight: number) => {
      if (!containerWidth || !containerHeight) return 1.2;
      const baseW = 595; // A4 width @72dpi
      const baseH = 842; // A4 height @72dpi
      switch (fitMode) {
        case "page-width":
          return (containerWidth - 48) / baseW;
        case "page-height":
          return (containerHeight - 100) / baseH;
        case "page-fit":
          return Math.min(
            (containerWidth - 48) / baseW,
            (containerHeight - 100) / baseH
          );
        case "auto":
        default:
          return scale;
      }
    },
    [fitMode, scale]
  );

  // Resize listener for auto-fit
  useEffect(() => {
    const onResize = () => {
      if (!scrollRef.current) return;
      const r = scrollRef.current.getBoundingClientRect();
      if (fitMode !== "auto") {
        setScale(calculateOptimalScale(r.width, r.height));
      }
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [calculateOptimalScale, fitMode]);

  // Document callbacks
  const onDocumentLoadSuccess = (pdf: pdfjs.PDFDocumentProxy) => {
    console.log("PDF loaded successfully:", { numPages: pdf.numPages, url });
    setPdfDoc(pdf);
    setNumPages(pdf.numPages);
    setLoading(false);
    setLoadingProgress(100);
    setError(null);
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

  const onDocumentLoadError = (err: Error) => {
    console.error("PDF load error:", err, "URL:", url);
    setLoading(false);
    setError(err.message || "Failed to load PDF");
  };

  // Virtual scrolling
  const rowVirtualizer = useVirtualizer({
    count: viewMode === "continuous" ? Math.max(numPages, 0) : 1,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 842 * scale + 24,
    overscan: 3,
    enabled: numPages > 0,
  });

  // Update current page from scroll
  useEffect(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    const onScroll = () => {
      const items = rowVirtualizer.getVirtualItems();
      if (!items.length) return;
      const mid = items[Math.floor(items.length / 2)];
      setPageNumber(mid.index + 1);
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [rowVirtualizer]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "f") {
          e.preventDefault();
          setSidebarOpen(true);
          searchInputRef.current?.focus();
        }
        if (e.key === "+" || e.key === "=") {
          e.preventDefault();
          setScale((s) => clamp(s * 1.2, 0.25, 5));
          setFitMode("auto");
        }
        if (e.key === "-") {
          e.preventDefault();
          setScale((s) => clamp(s / 1.2, 0.25, 5));
          setFitMode("auto");
        }
        if (e.key === "0") {
          e.preventDefault();
          setScale(1.2);
          setFitMode("auto");
        }
      } else {
        if (e.key === "f") {
          e.preventDefault();
          toggleFullscreen();
        } else if (e.key === "Escape") {
          if (isFullscreen) toggleFullscreen();
          else setSidebarOpen(false);
        } else if (e.key === "ArrowUp" || e.key === "PageUp") {
          e.preventDefault();
          setPageNumber((p) => Math.max(1, p - 1));
          if (viewMode === "continuous")
            rowVirtualizer.scrollToIndex(Math.max(0, pageNumber - 2));
        } else if (e.key === "ArrowDown" || e.key === "PageDown") {
          e.preventDefault();
          setPageNumber((p) => Math.min(numPages, p + 1));
          if (viewMode === "continuous")
            rowVirtualizer.scrollToIndex(Math.min(numPages - 1, pageNumber));
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isFullscreen, numPages, pageNumber, viewMode, rowVirtualizer]);

  // Fullscreen
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  }, []);

  // Gestures: pinch to zoom, ctrl+wheel zoom
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

  // ---- Search ----
  const searchCancelRef = useRef<{ token: number } | null>(null);

  const performSearch = useCallback(
    async (term: string) => {
      if (!pdfDoc || !numPages || !term.trim()) {
        setSearchResults([]);
        setCurrentSearchIndex(-1);
        return;
      }

      setIsSearching(true);
      const myToken = Date.now();
      searchCancelRef.current = { token: myToken };

      const lower = term.toLowerCase();
      const results: SearchResult[] = [];

      try {
        for (let i = 1; i <= numPages; i++) {
          // Cancel if a newer search started
          if (
            !searchCancelRef.current ||
            searchCancelRef.current.token !== myToken
          )
            return;

          const page = await pdfDoc.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = (textContent.items as any[])
            .map((it) => (typeof it.str === "string" ? it.str : ""))
            .join(" ");

          // Find all matches with context
          let idx = 0;
          const pageLower = pageText.toLowerCase();
          while (true) {
            idx = pageLower.indexOf(lower, idx);
            if (idx === -1) break;
            const start = Math.max(0, idx - 40);
            const end = Math.min(pageText.length, idx + lower.length + 40);
            const context = pageText.slice(start, end);
            results.push({
              pageIndex: i - 1,
              matchText: pageText.slice(idx, idx + lower.length),
              context,
            });
            idx += lower.length;
          }

          // Small yield to keep UI responsive
          if (i % 5 === 0) await new Promise((r) => setTimeout(r, 0));
        }
      } catch (e) {
        console.error("Search error", e);
      } finally {
        // Only commit if this is the latest search
        if (searchCancelRef.current?.token === myToken) {
          setSearchResults(results);
          setCurrentSearchIndex(results.length ? 0 : -1);
          if (results.length) {
            goToPage(results[0].pageIndex);
          }
          setIsSearching(false);
        }
      }
    },
    [pdfDoc, numPages]
  );

  const goToPage = useCallback(
    (pageIdx: number) => {
      setPageNumber(pageIdx + 1);
      if (viewMode === "continuous")
        rowVirtualizer.scrollToIndex(pageIdx, { align: "start" });
    },
    [rowVirtualizer, viewMode]
  );

  const gotoNextResult = () => {
    if (!searchResults.length) return;
    const next = (currentSearchIndex + 1) % searchResults.length;
    setCurrentSearchIndex(next);
    goToPage(searchResults[next].pageIndex);
  };

  const gotoPrevResult = () => {
    if (!searchResults.length) return;
    const prev =
      (currentSearchIndex - 1 + searchResults.length) % searchResults.length;
    setCurrentSearchIndex(prev);
    goToPage(searchResults[prev].pageIndex);
  };

  // ---- Selection -> Note ----
  const idgen = useRef(0);
  const addNoteFromSelection = () => {
    if (!pendingSelection) return;
    const id = `n${Date.now()}_${idgen.current++}`;
    setNotes((n) => [
      ...n,
      {
        id,
        pageIndex: pendingSelection.pageIndex,
        quote: pendingSelection.quote,
        rects: pendingSelection.rects,
        comment: addNoteText.trim(),
        color: "#fde68a", // amber
      },
    ]);
    setPendingSelection(null);
    setAddNoteText("");
    window.getSelection()?.removeAllRanges();
  };

  const cancelSelection = () => {
    setPendingSelection(null);
    setAddNoteText("");
    window.getSelection()?.removeAllRanges();
  };

  const removeNote = (id: string) =>
    setNotes((n) => n.filter((x) => x.id !== id));

  const handlePageMouseUp = (pageIndex: number) => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;

    const quote = sel.toString().trim();
    if (!quote) return;

    const rectList = Array.from(sel.getRangeAt(0).getClientRects());
    const pageEl = pageRefs.current.get(pageIndex);
    if (!pageEl || rectList.length === 0) return;
    const pageBox = pageEl.getBoundingClientRect();

    // Normalize rects to page box
    const rects: NormalizedRect[] = rectList.map((r) => ({
      x: (r.left - pageBox.left) / pageBox.width,
      y: (r.top - pageBox.top) / pageBox.height,
      w: r.width / pageBox.width,
      h: r.height / pageBox.height,
    }));

    // Anchor near the first rect
    const first = rectList[0];
    const anchorPx = {
      x: first.left - pageBox.left + first.width / 2,
      y: first.top - pageBox.top,
    };

    setPendingSelection({ pageIndex, rects, quote, anchorPx });
  };

  // Loading UI
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

  // Error UI
  if (error || !url) {
    return (
      <div className="flex h-[100dvh] w-full items-center justify-center bg-gray-50">
        <div className="text-center space-y-4 max-w-md">
          <div className="text-red-600 text-6xl mb-4">⚠️</div>
          <p className="text-gray-800 font-medium text-lg">
            {error ? "Failed to load PDF" : "No PDF URL provided"}
          </p>
          <p className="text-gray-600 text-sm mt-2">{error}</p>
          {url && (
            <p className="text-gray-500 text-xs mt-2 break-all">URL: {url}</p>
          )}
        </div>
      </div>
    );
  }

  // Memo counts per page for notes
  const notesByPage = useMemo(() => {
    const m = new Map<number, NoteItem[]>();
    for (const n of notes) {
      if (!m.has(n.pageIndex)) m.set(n.pageIndex, []);
      m.get(n.pageIndex)!.push(n);
    }
    return m;
  }, [notes]);

  return (
    <div className="flex h-[100dvh] w-full flex-col bg-gray-100">
      {/* Toolbar */}
      <div
        className={`flex items-center justify-between border-b bg-white shadow-sm transition-transform duration-300 ${
          isFullscreen && !showToolbar ? "-translate-y-full" : "translate-y-0"
        }`}
      >
        {/* Left */}
        <div className="flex items-center gap-1 p-2">
          <button
            className="p-2 hover:bg-gray-100 rounded"
            onClick={() => setSidebarOpen((s) => !s)}
            title="Toggle sidebar"
          >
            <Menu className="h-4 w-4" />
          </button>

          <div className="w-px h-6 bg-gray-300 mx-2" />

          <button
            className="p-2 hover:bg-gray-100 rounded"
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
            {[25, 50, 75, 100, 120, 150, 200, 300, 400, 500].map((v) => (
              <option key={v} value={v}>
                {v}%
              </option>
            ))}
            {![25, 50, 75, 100, 120, 150, 200, 300, 400, 500].includes(
              Math.round(scale * 100)
            ) && (
              <option value={Math.round(scale * 100)}>
                {Math.round(scale * 100)}%
              </option>
            )}
          </select>

          <button
            className="p-2 hover:bg-gray-100 rounded"
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
            className="p-2 hover:bg-gray-100 rounded"
            onClick={() => setRotation((r) => (r + 90) % 360)}
            title="Rotate page"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>

        {/* Center */}
        <div className="flex items-center gap-4 text-sm text-gray-600">
          <span className="font-medium truncate max-w-xs">
            {book.title || "PDF Document"}
          </span>
          {numPages > 0 && (
            <div className="flex items-center gap-2">
              <button
                className="p-1 hover:bg-gray-100 rounded"
                onClick={() => {
                  setPageNumber((p) => Math.max(1, p - 1));
                  if (viewMode === "continuous")
                    rowVirtualizer.scrollToIndex(Math.max(0, pageNumber - 2));
                }}
                disabled={pageNumber <= 1}
              >
                <ChevronUp className="h-4 w-4" />
              </button>
              <span className="min-w-0">
                Page {pageNumber} of {numPages}
              </span>
              <button
                className="p-1 hover:bg-gray-100 rounded"
                onClick={() => {
                  setPageNumber((p) => Math.min(numPages, p + 1));
                  if (viewMode === "continuous")
                    rowVirtualizer.scrollToIndex(
                      Math.min(numPages - 1, pageNumber)
                    );
                }}
                disabled={pageNumber >= numPages}
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* Right */}
        <div className="flex items-center gap-1 p-2">
          <button
            className="p-2 hover:bg-gray-100 rounded"
            onClick={() => setSidebarOpen(true)}
            title="Search (Ctrl+F)"
          >
            <Search className="h-4 w-4" />
          </button>

          <button
            className="p-2 hover:bg-gray-100 rounded"
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
              className="p-2 hover:bg-gray-100 rounded"
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
                    if (e.key === "Enter") performSearch(searchTerm);
                  }}
                />
              </div>
              <div className="flex gap-2">
                <button
                  className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm"
                  onClick={() => performSearch(searchTerm)}
                  disabled={isSearching || !searchTerm.trim()}
                >
                  {isSearching ? "Searching..." : "Search"}
                </button>
                <button
                  className="px-3 py-2 border rounded-md text-sm"
                  onClick={gotoPrevResult}
                  disabled={!searchResults.length}
                  title="Previous match"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  className="px-3 py-2 border rounded-md text-sm"
                  onClick={gotoNextResult}
                  disabled={!searchResults.length}
                  title="Next match"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">
                    {searchResults.length} result
                    {searchResults.length !== 1 ? "s" : ""}
                  </span>
                  <span className="text-xs text-gray-500">
                    {currentSearchIndex + 1} / {searchResults.length}
                  </span>
                </div>
                <div className="max-h-72 overflow-y-auto space-y-1">
                  {searchResults.map((r, i) => (
                    <div
                      key={`${r.pageIndex}-${i}`}
                      className={`p-2 text-xs border rounded cursor-pointer hover:bg-gray-50 ${
                        i === currentSearchIndex
                          ? "bg-blue-50 border-blue-200"
                          : "border-gray-200"
                      }`}
                      onClick={() => {
                        setCurrentSearchIndex(i);
                        goToPage(r.pageIndex);
                      }}
                    >
                      <div className="font-medium text-gray-800 mb-1">
                        Page {r.pageIndex + 1}
                      </div>
                      <div className="text-gray-600 line-clamp-2">
                        ...{r.context}...
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            <div className="pt-4 border-t">
              <h3 className="text-sm font-medium text-gray-800 mb-2 flex items-center gap-2">
                <StickyNote className="h-4 w-4" />
                Notes
              </h3>
              {notes.length === 0 ? (
                <div className="text-xs text-gray-500">
                  Select text in the document to add a note.
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {notes.map((n) => (
                    <div key={n.id} className="border rounded p-2 text-xs">
                      <div className="flex items-center justify-between">
                        <button
                          className="text-blue-600 underline"
                          onClick={() => goToPage(n.pageIndex)}
                        >
                          Page {n.pageIndex + 1}
                        </button>
                        <button
                          className="text-red-500"
                          onClick={() => removeNote(n.id)}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="mt-1 text-gray-700 italic">
                        &ldquo;{n.quote}&rdquo;
                      </div>
                      {n.comment && (
                        <div className="mt-1 text-gray-600">{n.comment}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

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

        {/* Main viewer */}
        <div className="flex-1 flex flex-col overflow-hidden">
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
                options={{
                  cMapUrl: `//unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`,
                  cMapPacked: true,
                  standardFontDataUrl: `//unpkg.com/pdfjs-dist@${pdfjs.version}/standard_fonts/`,
                }}
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
              >
                {viewMode === "continuous" && numPages > 0 ? (
                  <div
                    style={{
                      height: rowVirtualizer.getTotalSize(),
                      position: "relative",
                      width: "100%",
                    }}
                  >
                    {rowVirtualizer.getVirtualItems().map((vitem) => {
                      const pageIndex = vitem.index; // 0-based
                      return (
                        <div
                          key={vitem.key}
                          style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: "100%",
                            height: `${vitem.size}px`,
                            transform: `translateY(${vitem.start}px)`,
                          }}
                          className="flex justify-center items-start py-3"
                        >
                          <div
                            className="relative group"
                            ref={(el) => {
                              if (el) pageRefs.current.set(pageIndex, el);
                              else pageRefs.current.delete(pageIndex);
                            }}
                            onMouseUp={() => handlePageMouseUp(pageIndex)}
                          >
                            {/* Page canvas + text layer */}
                            <Page
                              pageNumber={pageIndex + 1}
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
                              className="shadow-lg react-pdf-page"
                            />

                            {/* Highlight overlays for saved notes */}
                            <OverlayHighlights
                              pageIndex={pageIndex}
                              rectsByNote={notesByPage.get(pageIndex)}
                            />

                            {/* Temporary selection highlight and Add Note popover */}
                            {pendingSelection &&
                              pendingSelection.pageIndex === pageIndex && (
                                <>
                                  <OverlayTempSelection
                                    rects={pendingSelection.rects}
                                  />
                                  <div
                                    className="absolute z-20 -translate-x-1/2 -translate-y-full"
                                    style={{
                                      left: pendingSelection.anchorPx.x,
                                      top: pendingSelection.anchorPx.y - 8,
                                    }}
                                  >
                                    <div className="bg-white border shadow rounded-md p-2 w-64">
                                      <div className="text-xs text-gray-600 line-clamp-2 italic mb-2">
                                        &ldquo;{pendingSelection.quote}&rdquo;
                                      </div>
                                      <textarea
                                        className="w-full border rounded p-2 text-sm"
                                        rows={3}
                                        placeholder="Add a comment…"
                                        value={addNoteText}
                                        onChange={(e) =>
                                          setAddNoteText(e.target.value)
                                        }
                                        autoFocus
                                      />
                                      <div className="flex justify-end gap-2 mt-2">
                                        <button
                                          className="px-2 py-1 text-sm"
                                          onClick={cancelSelection}
                                        >
                                          Cancel
                                        </button>
                                        <button
                                          className="px-2 py-1 text-sm bg-blue-600 text-white rounded"
                                          onClick={addNoteFromSelection}
                                        >
                                          Save note
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                </>
                              )}

                            {/* Page number hover label */}
                            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 px-2 py-1 bg-black/60 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity">
                              Page {pageIndex + 1}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : numPages > 0 ? (
                  <div className="flex justify-center">
                    <div
                      className="relative group"
                      ref={(el) => {
                        if (el) pageRefs.current.set(pageNumber - 1, el);
                        else pageRefs.current.delete(pageNumber - 1);
                      }}
                      onMouseUp={() => handlePageMouseUp(pageNumber - 1)}
                    >
                      <Page
                        pageNumber={pageNumber}
                        scale={scale}
                        rotate={rotation}
                        className="shadow-lg"
                      />
                      <OverlayHighlights
                        pageIndex={pageNumber - 1}
                        rectsByNote={notesByPage.get(pageNumber - 1)}
                      />
                      {pendingSelection &&
                        pendingSelection.pageIndex === pageNumber - 1 && (
                          <>
                            <OverlayTempSelection
                              rects={pendingSelection.rects}
                            />
                            <div
                              className="absolute z-20 -translate-x-1/2 -translate-y-full"
                              style={{
                                left: pendingSelection.anchorPx.x,
                                top: pendingSelection.anchorPx.y - 8,
                              }}
                            >
                              <div className="bg-white border shadow rounded-md p-2 w-64">
                                <div className="text-xs text-gray-600 line-clamp-2 italic mb-2">
                                  &ldquo;{pendingSelection.quote}&rdquo;
                                </div>
                                <textarea
                                  className="w-full border rounded p-2 text-sm"
                                  rows={3}
                                  placeholder="Add a comment…"
                                  value={addNoteText}
                                  onChange={(e) =>
                                    setAddNoteText(e.target.value)
                                  }
                                  autoFocus
                                />
                                <div className="flex justify-end gap-2 mt-2">
                                  <button
                                    className="px-2 py-1 text-sm"
                                    onClick={cancelSelection}
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    className="px-2 py-1 text-sm bg-blue-600 text-white rounded"
                                    onClick={addNoteFromSelection}
                                  >
                                    Save note
                                  </button>
                                </div>
                              </div>
                            </div>
                          </>
                        )}
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

/** Overlay for saved note highlights on a page */
function OverlayHighlights({
  pageIndex,
  rectsByNote,
}: {
  pageIndex: number;
  rectsByNote?: NoteItem[];
}) {
  if (!rectsByNote || rectsByNote.length === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-0">
      {rectsByNote.flatMap((note) =>
        note.rects.map((r, i) => (
          <div
            key={`${note.id}-${i}`}
            className="absolute rounded-sm"
            style={{
              left: `${r.x * 100}%`,
              top: `${r.y * 100}%`,
              width: `${r.w * 100}%`,
              height: `${r.h * 100}%`,
              background: (note.color ?? "#fde68a") + "AA", // semi
              outline: "1px solid rgba(245, 158, 11, 0.7)",
            }}
          />
        ))
      )}
    </div>
  );
}

/** Overlay for temporary selection highlight */
function OverlayTempSelection({ rects }: { rects: NormalizedRect[] }) {
  return (
    <div className="pointer-events-none absolute inset-0">
      {rects.map((r, i) => (
        <div
          key={i}
          className="absolute rounded-sm"
          style={{
            left: `${r.x * 100}%`,
            top: `${r.y * 100}%`,
            width: `${r.w * 100}%`,
            height: `${r.h * 100}%`,
            background: "rgba(147, 197, 253, 0.35)", // blue-300/35
            outline: "1px solid rgba(59, 130, 246, 0.6)",
          }}
        />
      ))}
    </div>
  );
}
