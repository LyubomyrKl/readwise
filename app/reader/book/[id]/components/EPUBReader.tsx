"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight, Settings, Bookmark } from "lucide-react";
import { IBook } from "@/app/reader/types";

declare global {
  interface Window {
    ePub?: any;
  }
}

type Theme = "light" | "dark" | "sepia";
interface EPUBReaderProps {
  book: IBook;
} // book should have .fileStorageKey or .fileUrl to the .epub

interface ReaderState {
  currentLocation: string | null;
  totalLocations: number;
  currentPage: number;
  progress: number;
  bookmarks: string[];
  fontSize: number;
  theme: Theme;
}

export default function EPUBReader({ book }: EPUBReaderProps) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<any>(null);
  const renditionRef = useRef<any>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [readerState, setReaderState] = useState<ReaderState>({
    currentLocation: null,
    totalLocations: 0,
    currentPage: 1,
    progress: 0,
    bookmarks: [],
    fontSize: 100,
    theme: "light",
  });

  // Use proxy to avoid S3 CORS/ACL issues
  const resolveSrc = useCallback(() => {
    const url = book.fileUrl;
    
    console.log('Book fileUrl:', url);
    
    // If it's already a full HTTP URL, try using it directly first
    // The blob URL approach should handle CORS issues
    if (url.startsWith('http')) {
      console.log('Using direct URL:', url);
      return url;
    }
    
    // Otherwise, treat it as a storage key and proxy through our API
    const proxyUrl = `/api/files/epub?key=${encodeURIComponent(url)}`;
    console.log('Using proxy URL:', proxyUrl);
    return proxyUrl;
  }, [book]);

  const loadEpubJS = useCallback(async () => {
    if (typeof window === "undefined" || window.ePub) return;
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js";
    script.async = true;
    document.head.appendChild(script);
    await new Promise<void>((res, rej) => {
      script.onload = () => res();
      script.onerror = () => rej(new Error("Failed to load ePub.js"));
    });
  }, []);

  const registerThemes = useCallback((theme: Theme, fontSize: number) => {
    const r = renditionRef.current;
    if (!r) return;
    const t = r.themes;
    t.register("light", {
      body: {
        background: "#ffffff",
        color: "#000000",
        "font-size": `${fontSize}%`,
      },
    });
    t.register("dark", {
      body: {
        background: "#1a1a1a",
        color: "#e5e5e5",
        "font-size": `${fontSize}%`,
      },
    });
    t.register("sepia", {
      body: {
        background: "#f4f1ea",
        color: "#5c4b37",
        "font-size": `${fontSize}%`,
      },
    });
    t.select(theme);
  }, []);

  const initializeReader = useCallback(async () => {
    if (!viewerRef.current) return;
    await loadEpubJS();
    if (!window.ePub) throw new Error("ePub.js not loaded");

    setIsLoading(true);
    setError(null);

    const src = resolveSrc();
    console.log('Loading EPUB from:', src);
    
    try {
      // Download the EPUB file as a blob and create a blob URL
      // This avoids CORS issues when ePub.js tries to access internal files
      const response = await fetch(src, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch EPUB: ${response.status}`);
      }
      
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      
      console.log('Created blob URL:', blobUrl);
      
      bookRef.current = window.ePub(blobUrl);
      
      renditionRef.current = bookRef.current.renderTo(viewerRef.current, {
        width: "100%",
        height: "100%",
        spread: "none",
      });

      // Themes and font
      registerThemes(readerState.theme, readerState.fontSize);
      
      // Store blob URL for cleanup
      (renditionRef.current as any)._blobUrl = blobUrl;
      
    } catch (error) {
      console.error('Error loading EPUB:', error);
      throw error;
    }

    // First display
    await renditionRef.current.display();

    // Generate locations for progress
    await bookRef.current.ready;
    await bookRef.current.locations.generate(1024);
    setReaderState((p) => ({
      ...p,
      totalLocations: bookRef.current.locations.total || 0,
    }));

    // Track progress
    renditionRef.current.on("relocated", (location: any) => {
      const cfi = location?.start?.cfi;
      const pct = bookRef.current.locations.percentageFromCfi(cfi) || 0;
      const total = bookRef.current.locations.total || 100;
      const page = Math.max(1, Math.min(total, Math.floor(pct * total) + 1));
      setReaderState((p) => ({
        ...p,
        currentLocation: cfi || null,
        progress: Math.round(pct * 100),
        currentPage: page,
      }));
    });

    setIsLoading(false);
  }, [
    loadEpubJS,
    resolveSrc,
    registerThemes,
    readerState.theme,
    readerState.fontSize,
  ]);

  useEffect(() => {
    initializeReader().catch((e) => {
      console.error(e);
      setError(e?.message || "Failed to load EPUB");
      setIsLoading(false);
    });
    return () => {
      try {
        // Clean up blob URL if it exists
        const blobUrl = (renditionRef.current as any)?._blobUrl;
        if (blobUrl) {
          URL.revokeObjectURL(blobUrl);
        }
        renditionRef.current?.destroy();
      } catch {}
    };
    // Re-init only when the book changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book]);

  // Theme + font handlers
  const updateTheme = (theme: Theme) => {
    setReaderState((p) => ({ ...p, theme }));
    renditionRef.current?.themes.select(theme);
  };
  const updateFontSize = (fontSize: number) => {
    setReaderState((p) => ({ ...p, fontSize }));
    renditionRef.current?.themes.fontSize(`${fontSize}%`);
  };

  const goToNextPage = () => renditionRef.current?.next();
  const goToPrevPage = () => renditionRef.current?.prev();

  const toggleBookmark = () => {
    const loc = readerState.currentLocation;
    if (!loc) return;
    setReaderState((p) => ({
      ...p,
      bookmarks: p.bookmarks.includes(loc)
        ? p.bookmarks.filter((b) => b !== loc)
        : [...p.bookmarks, loc],
    }));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goToPrevPage();
      if (e.key === "ArrowRight") goToNextPage();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-red-600 mb-2">Error</h1>
          <p className="text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      <div className="flex items-center justify-between p-4 border-b bg-background/80 backdrop-blur">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold truncate max-w-md">
            {book.title}
          </h1>
          {readerState.progress > 0 && (
            <span className="text-sm text-muted-foreground">
              {readerState.progress}%
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleBookmark}
            className={`p-2 rounded-md transition-colors ${
              readerState.bookmarks.includes(readerState.currentLocation || "")
                ? "bg-yellow-100 text-yellow-600"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <Bookmark className="h-4 w-4" />
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded-md text-muted-foreground hover:bg-muted transition-colors"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="p-4 border-b bg-muted/50">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-2">
              <span className="text-sm">Theme:</span>
              <div className="flex gap-1">
                {(["light", "dark", "sepia"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => updateTheme(t)}
                    className={`px-3 py-1 text-xs rounded ${
                      readerState.theme === t
                        ? "bg-primary text-primary-foreground"
                        : "bg-background border"
                    }`}
                  >
                    {t[0].toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm">Font Size:</span>
              <div className="flex gap-1">
                <button
                  onClick={() =>
                    updateFontSize(Math.max(80, readerState.fontSize - 10))
                  }
                  className="px-2 py-1 text-xs bg-background border rounded"
                >
                  A-
                </button>
                <span className="px-2 py-1 text-xs">
                  {readerState.fontSize}%
                </span>
                <button
                  onClick={() =>
                    updateFontSize(Math.min(150, readerState.fontSize + 10))
                  }
                  className="px-2 py-1 text-xs bg-background border rounded"
                >
                  A+
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80">
            <div className="text-center">
              <div className="animate-pulse text-muted-foreground mb-2">
                Loading EPUB...
              </div>
              <div className="text-xs text-muted-foreground">{book.title}</div>
            </div>
          </div>
        )}
        <div
          ref={viewerRef}
          className="w-full h-full"
          style={{ display: isLoading ? "none" : "block" }}
        />
        {!isLoading && (
          <>
            <button
              onClick={goToPrevPage}
              className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-background/80 shadow-lg hover:bg-background transition-all opacity-50 hover:opacity-100"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={goToNextPage}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-background/80 shadow-lg hover:bg-background transition-all opacity-50 hover:opacity-100"
              aria-label="Next page"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
      </div>

      {!isLoading && readerState.progress > 0 && (
        <div className="h-1 bg-muted">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${readerState.progress}%` }}
          />
        </div>
      )}
    </div>
  );
}
