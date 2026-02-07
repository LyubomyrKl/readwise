"use client";

import { useMemo, useRef, useEffect, useState, useCallback } from "react";
import { createPluginRegistration } from "@embedpdf/core";
import { EmbedPDF } from "@embedpdf/core/react";
import { usePdfiumEngine } from "@embedpdf/engines/react";
import { useGesture } from "@use-gesture/react";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Settings,
  Minus,
  Plus,
  StickyNote,
} from "lucide-react";

import { ViewportPluginPackage } from "@embedpdf/plugin-viewport";
import { Viewport } from "@embedpdf/plugin-viewport/react";
import { ScrollPluginPackage } from "@embedpdf/plugin-scroll";
import { Scroller, useScroll } from "@embedpdf/plugin-scroll/react";
import { LoaderPluginPackage } from "@embedpdf/plugin-loader";
import { RenderPluginPackage } from "@embedpdf/plugin-render";
import { RenderLayer } from "@embedpdf/plugin-render/react";
import { ZoomPluginPackage } from "@embedpdf/plugin-zoom";
import { useZoom } from "@embedpdf/plugin-zoom/react";

import { IBook } from "@/app/reader/types";
import PDFReaderMenu from "./PDFReaderMenu";
import NotesPanel from "./NotesPanel";
import type {
  ReadingPosition,
  NoteResponse,
  CreateNoteDto,
  UpdateNoteDto,
} from "@/lib/types";

type Props = {
  book: IBook;
  initialPosition?: ReadingPosition | null;
  notes?: NoteResponse[];
  onBackAction?: () => void;
  onPositionChange?: (position: ReadingPosition) => void;
  onCreateNote?: (dto: CreateNoteDto) => Promise<NoteResponse | null>;
  onUpdateNote?: (id: string, dto: UpdateNoteDto) => Promise<boolean>;
  onDeleteNote?: (id: string) => Promise<boolean>;
};

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;
const DEFAULT_ZOOM = 1;

export default function PDFReader({
  book,
  initialPosition,
  notes = [],
  onBackAction,
  onPositionChange,
  onCreateNote,
  onUpdateNote,
  onDeleteNote,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [, setRenderKey] = useState(0);
  const [devicePixelRatio, setDevicePixelRatio] = useState(1);
  const [menuVisible, setMenuVisible] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notesPanelOpen, setNotesPanelOpen] = useState(false);
  // Get initial page from saved position - only capture once
  const initialPageRef = useRef<number | null>(null);
  if (initialPageRef.current === null && initialPosition?.type === "pdf" && initialPosition.page) {
    initialPageRef.current = initialPosition.page;
  }
  const initialPage = initialPageRef.current ?? 1;
    const [isScrolling, setIsScrolling] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfLoadError, setPdfLoadError] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  const { engine, isLoading, error } = usePdfiumEngine();

  // Pre-fetch PDF with credentials
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (fetchedRef.current || !book.fileUrl) return;
    fetchedRef.current = true;

    const fetchPdf = async () => {
      try {
        const response = await fetch(book.fileUrl!, {
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error(
            `Failed to fetch PDF: ${response.status} ${response.statusText}`
          );
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;
        setPdfBlobUrl(url);
      } catch (err) {
        setPdfLoadError(
          err instanceof Error ? err.message : "Failed to load PDF"
        );
      }
    };

    fetchPdf();

    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [book.fileUrl]);

  // Scroll detection for render quality
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    let t: ReturnType<typeof setTimeout> | undefined;

    const onScroll = () => {
      if (!isScrolling) setIsScrolling(true);
      if (t) clearTimeout(t);
      t = setTimeout(() => setIsScrolling(false), 140);
    };

    root.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      root.removeEventListener("scroll", onScroll, { capture: true } as any);
      if (t) clearTimeout(t);
    };
  }, [isScrolling]);

  // DPR watcher for monitor changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    let mql: MediaQueryList | null = null;
    let raf = 0;

    const onChange = () => {
      setDevicePixelRatio(window.devicePixelRatio || 1);
      setRenderKey((k) => k + 1);
      raf = window.requestAnimationFrame(watch);
    };

    const watch = () => {
      if (mql) mql.removeEventListener("change", onChange);
      mql = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      mql.addEventListener("change", onChange);
    };

    watch();
    return () => {
      if (mql) mql.removeEventListener("change", onChange);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const plugins = useMemo(() => {
    if (!pdfBlobUrl) return [] as any[];
    return [
      createPluginRegistration(LoaderPluginPackage, {
        loadingOptions: {
          type: "url",
          pdfFile: { id: book.id || "doc", url: pdfBlobUrl },
        },
      }),
      createPluginRegistration(ViewportPluginPackage),
      createPluginRegistration(ScrollPluginPackage, {
        initialPage: initialPageRef.current ?? 1,
      }),
      createPluginRegistration(RenderPluginPackage),
      createPluginRegistration(ZoomPluginPackage),
    ];
  }, [pdfBlobUrl, book.id]);

  if (error) {
    return (
      <div className="flex h-[100dvh] w-full items-center justify-center bg-gray-50">
        <div className="text-center space-y-2">
          <div className="text-red-600 text-4xl">Warning</div>
          <div className="text-sm text-gray-700">Failed to init PDF engine</div>
          <div className="text-xs text-gray-500">{String(error)}</div>
        </div>
      </div>
    );
  }

  if (pdfLoadError) {
    return (
      <div className="flex h-[100dvh] w-full items-center justify-center bg-gray-50">
        <div className="text-center space-y-2">
          <div className="text-red-600 text-4xl">Warning</div>
          <div className="text-sm text-gray-700">Failed to load PDF</div>
          <div className="text-xs text-gray-500">{pdfLoadError}</div>
        </div>
      </div>
    );
  }

  if (isLoading || !engine || !book.fileUrl || !pdfBlobUrl) {
    return (
      <div className="flex h-[100dvh] w-full items-center justify-center bg-gray-50">
        <div className="text-center space-y-2">
          <div className="animate-pulse text-gray-600">Loading PDF...</div>
          <div className="text-xs text-gray-500 truncate max-w-xs">
            {book.title || "Document"}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative h-[calc(100dvh-0px)] w-full select-none"
      ref={containerRef}
      onDoubleClick={() => {
        if (!menuVisible && !settingsOpen && !notesPanelOpen) setMenuVisible(true);
      }}
    >
      <EmbedPDF engine={engine} plugins={plugins}>
        <PDFReaderContent
          containerRef={containerRef}
          devicePixelRatio={devicePixelRatio}
          isScrolling={isScrolling}
          menuVisible={menuVisible}
          setMenuVisible={setMenuVisible}
          settingsOpen={settingsOpen}
          setSettingsOpen={setSettingsOpen}
          notesPanelOpen={notesPanelOpen}
          setNotesPanelOpen={setNotesPanelOpen}
          setRenderKey={setRenderKey}
          onBackAction={onBackAction}
          onPositionChange={onPositionChange}
          notes={notes}
          onCreateNote={onCreateNote}
          onUpdateNote={onUpdateNote}
          onDeleteNote={onDeleteNote}
        />
      </EmbedPDF>
    </div>
  );
}

function PDFReaderContent({
  containerRef,
  devicePixelRatio,
  isScrolling,
  menuVisible,
  setMenuVisible,
  settingsOpen,
  setSettingsOpen,
  notesPanelOpen,
  setNotesPanelOpen,
  onBackAction,
  onPositionChange,
  notes,
  onCreateNote,
  onUpdateNote,
  onDeleteNote,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  devicePixelRatio: number;
  isScrolling: boolean;
  menuVisible: boolean;
  setMenuVisible: (v: boolean) => void;
  settingsOpen: boolean;
  setSettingsOpen: (v: boolean) => void;
  notesPanelOpen: boolean;
  setNotesPanelOpen: (v: boolean) => void;
  setRenderKey: (fn: (k: number) => number) => void;
  onBackAction?: () => void;
  onPositionChange?: (position: ReadingPosition) => void;
  notes: NoteResponse[];
  onCreateNote?: (dto: CreateNoteDto) => Promise<NoteResponse | null>;
  onUpdateNote?: (id: string, dto: UpdateNoteDto) => Promise<boolean>;
  onDeleteNote?: (id: string) => Promise<boolean>;
}) {
  // Use scroll hook to get current page and total pages
  const { state: scrollState, scrollToNextPage, scrollToPreviousPage } = useScroll();
  const currentPage = scrollState?.currentPage ?? 1;
  const totalPages = scrollState?.totalPages ?? 1;

  // Report page changes to parent for position tracking
  const lastReportedPageRef = useRef<number>(0);
  useEffect(() => {
    if (lastReportedPageRef.current !== currentPage && totalPages > 0) {
      lastReportedPageRef.current = currentPage;
      const percentage = Math.round((currentPage / totalPages) * 100);
      onPositionChange?.({
        type: "pdf",
        page: currentPage,
        percentage,
      });
    }
  }, [currentPage, totalPages, onPositionChange]);

  const { provides, state } = useZoom();
  const currentZoom = state?.currentZoomLevel ?? DEFAULT_ZOOM;
  const zoomPercent = Math.round(currentZoom * 100);

  const requestZoom = useCallback(
    (newZoom: number) => {
      if (provides) {
        const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
        provides.requestZoom(clamped);
      }
    },
    [provides]
  );

  const zoomIn = useCallback(() => {
    requestZoom(currentZoom + 0.25);
  }, [currentZoom, requestZoom]);

  const zoomOut = useCallback(() => {
    requestZoom(currentZoom - 0.25);
  }, [currentZoom, requestZoom]);

  const handleZoomChange = useCallback(
    (percent: number) => {
      requestZoom(percent / 100);
    },
    [requestZoom]
  );

  // Pinch gesture for touch zoom
  useGesture(
    {
      onPinch: ({ da: [d] }) => {
        const factor = d > 1 ? 1.02 : 0.98;
        requestZoom(currentZoom * factor);
      },
    },
    {
      target: containerRef,
      eventOptions: { passive: true },
    }
  );

  // Ctrl+wheel zoom
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !provides) return;

    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.95 : 1.05;
      requestZoom(currentZoom * factor);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [containerRef, provides, currentZoom, requestZoom]);

  return (
    <>
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
                {onBackAction && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      onBackAction();
                      setMenuVisible(false);
                    }}
                    aria-label="Back"
                    className="rounded-full"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => scrollToPreviousPage?.()}
                  aria-label="Previous page"
                  className="rounded-full"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => scrollToNextPage?.()}
                  aria-label="Next page"
                  className="rounded-full"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={zoomOut}
                  aria-label="Zoom out"
                  className="rounded-full"
                >
                  <Minus className="h-4 w-4" />
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={zoomIn}
                  aria-label="Zoom in"
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
                Page {currentPage} of {totalPages}
              </div>
            </div>
          </div>
        </>
      )}

      {/* PDF Viewport */}
      <div className="absolute inset-0">
        <Viewport style={{ height: "100%", width: "100%" }}>
          <Scroller
            renderPage={({ width, height, pageIndex }) => (
              <div style={{ width, height }}>
                <CrispRenderLayer
                  pageIndex={pageIndex}
                  baseDpr={devicePixelRatio}
                  isScrolling={isScrolling}
                />
              </div>
            )}
          />
        </Viewport>
      </div>

      {settingsOpen && (
        <PDFReaderMenu
          zoom={zoomPercent}
          onZoomChange={handleZoomChange}
          currentPage={currentPage}
          totalPages={totalPages}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {notesPanelOpen && (
        <NotesPanel
          notes={notes}
          showHighlights={false}
          onClose={() => setNotesPanelOpen(false)}
          onCreateNote={onCreateNote}
          onUpdateNote={onUpdateNote}
          onDeleteNote={onDeleteNote}
        />
      )}
    </>
  );
}

function CrispRenderLayer({
  pageIndex,
  baseDpr,
  isScrolling,
}: {
  pageIndex: number;
  baseDpr: number;
  isScrolling: boolean;
}) {
  const { state } = useZoom();
  const zoom = state?.currentZoomLevel ?? 1;

  const dpr = isScrolling
    ? Math.min(2, Math.max(1, baseDpr))
    : Math.min(3, Math.max(1, baseDpr * Math.min(2, zoom)));

  return <RenderLayer key={pageIndex} pageIndex={pageIndex} dpr={dpr} />;
}
