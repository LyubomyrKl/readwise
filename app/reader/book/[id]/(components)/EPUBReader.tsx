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
  BookMarked,
  StickyNote,
} from "lucide-react";
import { IBook } from "@/app/reader/types";
import EPUBReaderMenu from "./EPUBReaderMenu";
import HighlightPopover, { HIGHLIGHT_COLORS } from "./HighlightPopover";
import NotesPanel from "./NotesPanel";
import type {
  ReadingPosition,
  HighlightResponse,
  NoteResponse,
  CreateHighlightDto,
  CreateNoteDto,
  UpdateHighlightDto,
  UpdateNoteDto,
} from "@/lib/types";

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
  initialPosition?: ReadingPosition | null;
  highlights?: HighlightResponse[];
  notes?: NoteResponse[];
  onBackAction?: () => void;
  onPositionChange?: (position: ReadingPosition) => void;
  onCreateHighlight?: (dto: CreateHighlightDto) => Promise<HighlightResponse | null>;
  onUpdateHighlight?: (id: string, dto: UpdateHighlightDto) => Promise<boolean>;
  onDeleteHighlight?: (id: string) => Promise<boolean>;
  onCreateNote?: (dto: CreateNoteDto) => Promise<NoteResponse | null>;
  onUpdateNote?: (id: string, dto: UpdateNoteDto) => Promise<boolean>;
  onDeleteNote?: (id: string) => Promise<boolean>;
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
  initialPosition,
  highlights = [],
  notes = [],
  onBackAction,
  onPositionChange,
  onCreateHighlight,
  onUpdateHighlight,
  onDeleteHighlight,
  onCreateNote,
  onUpdateNote,
  onDeleteNote,
}: EPUBReaderProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const renditionRef = useRef<any>(null);

  // Initialize location from server position or fallback to localStorage
  const [location, setLocation] = useState<string | null>(() => {
    if (initialPosition?.type === "epub" && initialPosition.cfi) {
      return initialPosition.cfi;
    }
    if (typeof window !== "undefined") {
      return localStorage.getItem(LOCATION_KEY(book.id));
    }
    return null;
  });
  const [progress, setProgress] = useState(
    () => initialPosition?.percentage || 0
  );
  const [menuVisible, setMenuVisible] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notesPanelOpen, setNotesPanelOpen] = useState(false);
  const [fontSize, setFontSize] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_FONT_SIZE;
    return Number(localStorage.getItem(FONT_SIZE_KEY)) || DEFAULT_FONT_SIZE;
  });
  const [epubData, setEpubData] = useState<ArrayBuffer | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Highlight popover state
  const [selectionInfo, setSelectionInfo] = useState<{
    cfiRange: string;
    text: string;
    position: { x: number; y: number };
  } | null>(null);

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

  // Apply existing highlights when rendition is ready
  const appliedHighlightsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const r = renditionRef.current;
    if (!r || highlights.length === 0) return;

    highlights.forEach((h) => {
      if (appliedHighlightsRef.current.has(h.id)) return;
      if (h.anchor && typeof h.anchor === "object" && "cfi" in h.anchor) {
        try {
          r.annotations.add(
            "highlight",
            (h.anchor as { cfi: string }).cfi,
            {},
            undefined,
            {
              fill: h.color || HIGHLIGHT_COLORS[0].value,
              "fill-opacity": 0.35,
            }
          );
          appliedHighlightsRef.current.add(h.id);
        } catch {}
      }
    });
  }, [highlights]);

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
      // Keep localStorage as a local cache/fallback
      localStorage.setItem(LOCATION_KEY(book.id), epubcfi);

      const r = renditionRef.current;
      if (r?.book?.locations) {
        try {
          const pct = r.book.locations.percentageFromCfi(epubcfi) || 0;
          const progressPct = Math.round(pct * 100);
          setProgress(progressPct);

          // Report position change to parent for server persistence
          onPositionChange?.({
            type: "epub",
            cfi: epubcfi,
            percentage: progressPct,
          });
        } catch {}
      }
    },
    [book.id, onPositionChange]
  );

  const onRendition = useCallback(
    (rendition: any) => {
      renditionRef.current = rendition;

      try {
        rendition.themes.fontSize(`${fontSize}%`);
      } catch {}

      // Apply existing highlights
      highlights.forEach((h) => {
        if (h.anchor && typeof h.anchor === "object" && "cfi" in h.anchor) {
          try {
            rendition.annotations.add(
              "highlight",
              (h.anchor as { cfi: string }).cfi,
              {},
              undefined,
              {
                fill: h.color || HIGHLIGHT_COLORS[0].value,
                "fill-opacity": 0.35,
              }
            );
            appliedHighlightsRef.current.add(h.id);
          } catch {}
        }
      });

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

      rendition.on("selected", async (cfiRange: string, contents: any) => {
        const text = await rendition.book
          .getRange(cfiRange)
          ?.then((range: Range) => range.toString())
          .catch(() => "");

        if (!text?.trim()) return;

        // Get selection position for popover
        try {
          const selection = contents.window.getSelection();
          if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            const iframe = contents.document.defaultView.frameElement;
            const iframeRect = iframe?.getBoundingClientRect() || { left: 0, top: 0 };

            setSelectionInfo({
              cfiRange,
              text,
              position: {
                x: iframeRect.left + rect.left + rect.width / 2,
                y: iframeRect.top + rect.top,
              },
            });
          }
        } catch {
          // Fallback: show popover in center
          setSelectionInfo({
            cfiRange,
            text,
            position: { x: window.innerWidth / 2, y: 100 },
          });
        }
      });
    },
    [fontSize, highlights]
  );

  const handleHighlight = useCallback(
    async (color: string) => {
      if (!selectionInfo || !renditionRef.current) return;

      // Add visual highlight
      try {
        renditionRef.current.annotations.add(
          "highlight",
          selectionInfo.cfiRange,
          {},
          undefined,
          { fill: color, "fill-opacity": 0.35 }
        );
      } catch {}

      // Persist to backend
      if (onCreateHighlight) {
        await onCreateHighlight({
          text: selectionInfo.text,
          anchor: {
            type: "epub",
            cfi: selectionInfo.cfiRange,
          },
          color,
        });
      }

      setSelectionInfo(null);
    },
    [selectionInfo, onCreateHighlight]
  );

  const handleAddNote = useCallback(async () => {
    if (!selectionInfo) return;

    // First create the highlight
    let highlightId: string | undefined;
    if (onCreateHighlight) {
      const highlight = await onCreateHighlight({
        text: selectionInfo.text,
        anchor: {
          type: "epub",
          cfi: selectionInfo.cfiRange,
        },
        color: HIGHLIGHT_COLORS[0].value,
      });
      highlightId = highlight?.id;

      // Add visual highlight
      try {
        renditionRef.current?.annotations.add(
          "highlight",
          selectionInfo.cfiRange,
          {},
          undefined,
          { fill: HIGHLIGHT_COLORS[0].value, "fill-opacity": 0.35 }
        );
      } catch {}
    }

    // Then create the note
    if (onCreateNote) {
      await onCreateNote({
        body: `Note on: "${selectionInfo.text.slice(0, 100)}${selectionInfo.text.length > 100 ? "..." : ""}"`,
        anchor: {
          type: "epub",
          cfi: selectionInfo.cfiRange,
        },
      });
    }

    setSelectionInfo(null);
    setNotesPanelOpen(true);
  }, [selectionInfo, onCreateHighlight, onCreateNote]);

  const goPrev = () => renditionRef.current?.prev();
  const goNext = () => renditionRef.current?.next();

  const handleNavigateToNote = useCallback((note: NoteResponse) => {
    if (note.anchor && typeof note.anchor === "object" && "cfi" in note.anchor) {
      const cfi = (note.anchor as { cfi: string }).cfi;
      renditionRef.current?.display(cfi);
    }
    setNotesPanelOpen(false);
  }, []);

  return (
    <div
      className="relative h-[calc(100dvh-0px)] w-full select-none"
      ref={containerRef}
      onDoubleClick={() => {
        if (!menuVisible && !settingsOpen && !notesPanelOpen) setMenuVisible(true);
      }}
    >
      {/* Highlight popover */}
      {selectionInfo && (
        <HighlightPopover
          position={selectionInfo.position}
          selectedText={selectionInfo.text}
          onHighlight={handleHighlight}
          onAddNote={handleAddNote}
          onClose={() => setSelectionInfo(null)}
        />
      )}

      {/* Quick menu */}
      {menuVisible && !settingsOpen && !notesPanelOpen && (
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
                  onClick={() =>
                    setFontSize((f) => Math.max(MIN_FONT_SIZE, f - 10))
                  }
                  aria-label="Decrease font size"
                  className="rounded-full"
                >
                  <Minus className="h-4 w-4" />
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setFontSize((f) => Math.min(MAX_FONT_SIZE, f + 10))
                  }
                  aria-label="Increase font size"
                  className="rounded-full"
                >
                  <Plus className="h-4 w-4" />
                </Button>

                <div className="w-px h-6 bg-border" />

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setNotesPanelOpen(true);
                    setMenuVisible(false);
                  }}
                  aria-label="Notes"
                  className="rounded-full relative"
                >
                  <StickyNote className="h-4 w-4" />
                  {notes.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-primary-foreground text-[10px] rounded-full flex items-center justify-center">
                      {notes.length}
                    </span>
                  )}
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

      {notesPanelOpen && (
        <NotesPanel
          notes={notes}
          highlights={highlights}
          onClose={() => setNotesPanelOpen(false)}
          onNavigateToNote={handleNavigateToNote}
          onCreateNote={onCreateNote}
          onUpdateNote={onUpdateNote}
          onDeleteNote={onDeleteNote}
          onDeleteHighlight={onDeleteHighlight}
        />
      )}
    </div>
  );
}
