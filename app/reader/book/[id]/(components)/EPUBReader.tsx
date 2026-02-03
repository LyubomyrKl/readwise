"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useGesture } from "@use-gesture/react";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Settings,
  Minus,
  Plus,
  Loader2,
} from "lucide-react";
import { IBook } from "@/app/reader/types";
import EPUBReaderMenu from "./EPUBReaderMenu";

const ReactReader = dynamic(
  () => import("react-reader").then((m) => m.ReactReader),
  { ssr: false }
);

async function fetchEpubAsArrayBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch EPUB: ${response.status}`);
  }
  return response.arrayBuffer();
}

export type EPUBReaderProps = {
  book: IBook;
  onBackAction?: () => void;
  onPageChange?: (page: number) => void;
  onCreateHighlightAction?: (h: { cfiRange: string; text?: string }) => void;
  onLocationPersistAction?: (
    bookId: string,
    cfi: string,
    progressPct: number
  ) => void;
};

const LOCATION_KEY = (id: string) => `epub.cfi.${id}`;
const FONT_SIZE_KEY = "epub.fontSize";
const DEFAULT_FONT_SIZE = 100;
const MIN_FONT_SIZE = 70;
const MAX_FONT_SIZE = 180;

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

export default function EPUBReader({
  book,
  onBackAction,
  onPageChange,
  onCreateHighlightAction,
  onLocationPersistAction,
}: EPUBReaderProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const renditionRef = useRef<any>(null);

  const [location, setLocation] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [menuVisible, setMenuVisible] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fontSize, setFontSize] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_FONT_SIZE;
    return Number(localStorage.getItem(FONT_SIZE_KEY)) || DEFAULT_FONT_SIZE;
  });
  const [epubData, setEpubData] = useState<ArrayBuffer | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Fetch EPUB as ArrayBuffer to avoid epubjs making relative URL requests
  useEffect(() => {
    let cancelled = false;
    setEpubData(null);
    setLoadError(null);

    fetchEpubAsArrayBuffer(book.fileUrl)
      .then((data) => {
        if (!cancelled) setEpubData(data);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [book.fileUrl]);

  // Restore saved reading position
  useEffect(() => {
    const saved = localStorage.getItem(LOCATION_KEY(book.id));
    if (saved) setLocation(saved);
  }, [book.id]);

  // Apply font size to rendition
  useEffect(() => {
    const r = renditionRef.current;
    if (!r) return;
    try {
      r.themes.fontSize(`${fontSize}%`);
    } catch {}
    localStorage.setItem(FONT_SIZE_KEY, String(fontSize));
  }, [fontSize]);

  // Touch gestures
  useGesture(
    {
      onDragEnd: ({ swipe: [sx] }) => {
        if (!renditionRef.current) return;
        if (sx === -1) renditionRef.current.next();
        if (sx === 1) renditionRef.current.prev();
      },
      onPinch: ({ da: [d] }) => {
        if (!renditionRef.current) return;
        const newSize = clamp(
          Math.round(fontSize * (d > 1 ? 1.02 : 0.98)),
          MIN_FONT_SIZE,
          MAX_FONT_SIZE
        );
        if (newSize !== fontSize) setFontSize(newSize);
      },
    },
    { target: containerRef, eventOptions: { passive: true } }
  );

  const lastLocationRef = useRef<string | null>(null);

  const onLocationChanged = useCallback(
    async (epubcfi: string) => {
      // Prevent duplicate calls with same location
      if (lastLocationRef.current === epubcfi) return;
      lastLocationRef.current = epubcfi;

      setLocation(epubcfi);
      localStorage.setItem(LOCATION_KEY(book.id), epubcfi);

      const r = renditionRef.current;
      if (r?.book?.locations) {
        try {
          const pct = r.book.locations.percentageFromCfi(epubcfi) || 0;
          const progressPct = Math.round(pct * 100);
          setProgress(progressPct);

          // Calculate approximate page from percentage
          const totalPages = book.pageCount || 100;
          const currentPage = Math.round((pct * totalPages));
          onPageChange?.(currentPage);

          onLocationPersistAction?.(book.id, epubcfi, progressPct);
        } catch {}
      }
    },
    [book.id, book.pageCount, onPageChange, onLocationPersistAction]
  );

  const onRendition = useCallback(
    (rendition: any) => {
      renditionRef.current = rendition;

      try {
        rendition.themes.fontSize(`${fontSize}%`);
      } catch {}

      rendition.on("keyup", (e: KeyboardEvent) => {
        if (e.key === "ArrowRight") rendition.next();
        if (e.key === "ArrowLeft") rendition.prev();
        if (e.key === "+" || e.key === "=") {
          setFontSize((f) => clamp(f + 5, MIN_FONT_SIZE, MAX_FONT_SIZE));
        }
        if (e.key === "-") {
          setFontSize((f) => clamp(f - 5, MIN_FONT_SIZE, MAX_FONT_SIZE));
        }
      });

      rendition.on("selected", async (cfiRange: string) => {
        const text = await rendition.book
          .getRange(cfiRange)
          ?.then((range: Range) => range.toString())
          .catch(() => "");

        onCreateHighlightAction?.({ cfiRange, text });

        try {
          rendition.annotations.add("highlight", cfiRange, {}, undefined, {
            fill: "#ffe066",
            "fill-opacity": 0.35,
          });
        } catch {}
      });
    },
    [fontSize, onCreateHighlightAction]
  );

  const goPrev = () => renditionRef.current?.prev();
  const goNext = () => renditionRef.current?.next();

  return (
    <div
      className="relative h-[calc(100dvh-0px)] w-full select-none"
      ref={containerRef}
      onDoubleClick={() => {
        if (!menuVisible && !settingsOpen) setMenuVisible(true);
      }}
    >
      {/* Quick menu */}
      {menuVisible && !settingsOpen && (
        <>
          <div
            className="absolute inset-0 z-20"
            onClick={() => setMenuVisible(false)}
          />
          <div className="absolute inset-0 z-20 pointer-events-none">
            <div className="pointer-events-auto absolute top-2 left-1/2 transform -translate-x-1/2">
              <div
                className="flex items-center gap-2 bg-background/95 rounded-full p-2 shadow-xl border"
                onClick={(e) => e.stopPropagation()}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    onBackAction?.();
                    setMenuVisible(false);
                  }}
                  aria-label="Back"
                  className="rounded-full"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={goPrev}
                  aria-label="Previous page"
                  className="rounded-full"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={goNext}
                  aria-label="Next page"
                  className="rounded-full"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFontSize((f) => Math.max(MIN_FONT_SIZE, f - 10))}
                  aria-label="Decrease font size"
                  className="rounded-full"
                >
                  <Minus className="h-4 w-4" />
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFontSize((f) => Math.min(MAX_FONT_SIZE, f + 10))}
                  aria-label="Increase font size"
                  className="rounded-full"
                >
                  <Plus className="h-4 w-4" />
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSettingsOpen(true);
                    setMenuVisible(false);
                  }}
                  aria-label="Settings"
                  className="rounded-full"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="pointer-events-none absolute bottom-4 left-1/2 transform -translate-x-1/2">
              <div className="bg-background/95 rounded-full px-3 py-1 text-xs shadow-xl border">
                {progress}%
              </div>
            </div>
          </div>
        </>
      )}

      {/* Reader */}
      <div className="absolute inset-0">
        {loadError ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-destructive">
              <p>Failed to load book</p>
              <p className="text-sm text-muted-foreground">{loadError}</p>
            </div>
          </div>
        ) : !epubData ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ReactReader
            key={book.id}
            url={epubData}
            location={location ?? null}
            locationChanged={onLocationChanged}
            getRendition={onRendition}
            epubOptions={{ allowScriptedContent: true }}
          />
        )}
      </div>

      {settingsOpen && (
        <EPUBReaderMenu
          fontSize={fontSize}
          onFontSizeChange={setFontSize}
          progress={progress}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
