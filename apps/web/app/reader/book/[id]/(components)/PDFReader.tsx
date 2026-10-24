"use client";

import { useMemo, useRef, useEffect, useState, useCallback } from "react";
import { createPluginRegistration } from "@embedpdf/core";
import { EmbedPDF } from "@embedpdf/core/react";
import { usePdfiumEngine } from "@embedpdf/engines/react";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Settings,
  Minus,
  Plus,
  StickyNote,
  MoreHorizontal,
  Maximize2,
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
import { usePdfGestures } from "./usePdfGestures";
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

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
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
  const [isMobile, setIsMobile] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);
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

  // Detect mobile and container width for fit-to-width
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768 || "ontouchstart" in window);
    };
    const updateContainerWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
      }
    };
    checkMobile();
    updateContainerWidth();
    window.addEventListener("resize", checkMobile);
    window.addEventListener("resize", updateContainerWidth);
    return () => {
      window.removeEventListener("resize", checkMobile);
      window.removeEventListener("resize", updateContainerWidth);
    };
  }, []);

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
          <div className="text-xs text-gray-500 truncate max-w-xs px-4" title={book.title || "Document"}>
            {book.title || "Document"}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative h-[calc(100dvh-0px)] w-full select-none overscroll-contain"
      ref={containerRef}
      style={{ touchAction: isMobile ? "pan-y" : "auto" }}
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
          isMobile={isMobile}
          containerWidth={containerWidth}
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
  isMobile,
  containerWidth,
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
  isMobile: boolean;
  containerWidth: number;
}) {
  // Use scroll hook to get current page and total pages
  const { state: scrollState } = useScroll();
  const currentPage = scrollState?.currentPage ?? 1;
  const totalPages = scrollState?.totalPages ?? 1;
  const progress = totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0;

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
  const fitToWidthAppliedRef = useRef(false);

  const requestZoom = useCallback(
    (newZoom: number) => {
      if (provides) {
        const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
        provides.requestZoom(clamped);
      }
    },
    [provides]
  );

  // Mobile pinch-to-zoom and double-tap gestures
  const { isZooming } = usePdfGestures({
    containerRef,
    currentZoom,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    onZoomChange: requestZoom,
    enabled: isMobile,
  });

  // Auto fit-to-width on mobile on first load
  useEffect(() => {
    if (!isMobile || !provides || containerWidth <= 0 || fitToWidthAppliedRef.current) return;

    // Delay to allow PDF pages to render
    const timer = setTimeout(() => {
      if (fitToWidthAppliedRef.current) return;

      const pageEl = containerRef.current?.querySelector('[data-page-index]') as HTMLElement;
      if (pageEl) {
        const currentRenderedWidth = pageEl.offsetWidth;
        const targetWidth = containerWidth - 32;
        // At default zoom (1.0), calculate what zoom we need
        const newZoom = targetWidth / currentRenderedWidth;
        const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
        provides.requestZoom(clamped);
      } else {
        // Fallback for standard PDF
        const targetWidth = containerWidth - 32;
        const pdfWidth = 612;
        const fitZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, targetWidth / pdfWidth));
        provides.requestZoom(fitZoom);
      }
      fitToWidthAppliedRef.current = true;
    }, 300);

    return () => clearTimeout(timer);
  }, [isMobile, provides, containerWidth, containerRef]);

  const zoomIn = useCallback(() => {
    const step = isMobile ? 0.15 : 0.25;
    requestZoom(currentZoom + step);
  }, [currentZoom, requestZoom, isMobile]);

  const zoomOut = useCallback(() => {
    const step = isMobile ? 0.15 : 0.25;
    requestZoom(currentZoom - step);
  }, [currentZoom, requestZoom, isMobile]);

  const handleZoomChange = useCallback(
    (percent: number) => {
      requestZoom(percent / 100);
    },
    [requestZoom]
  );

  const fitToWidth = useCallback(() => {
    if (!provides) return;

    const width = containerRef.current?.clientWidth || window.innerWidth;
    const targetWidth = width - 32;

    // Get the current rendered page width by finding the page element
    const pageEl = containerRef.current?.querySelector('[data-page-index]') as HTMLElement;
    if (pageEl) {
      const currentRenderedWidth = pageEl.offsetWidth;
      // Calculate: at current zoom, page renders at currentRenderedWidth
      // We want it to fit targetWidth
      const newZoom = (targetWidth / currentRenderedWidth) * currentZoom;
      const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
      provides.requestZoom(clamped);
    } else {
      // Fallback: assume standard PDF width ~612pt at zoom 1.0
      const pdfWidth = 612;
      const fitZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, targetWidth / pdfWidth));
      provides.requestZoom(fitZoom);
    }
  }, [provides, currentZoom, containerRef]);

  // Ctrl+wheel zoom (desktop)
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !provides) return;

    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.92 : 1.08;
      requestZoom(currentZoom * factor);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [containerRef, provides, currentZoom, requestZoom]);

  return (
    <>
      {/* Always visible progress bar */}
      <div className="fixed top-0 left-0 right-0 h-[3px] z-30 bg-muted/30">
        <div
          className="h-full bg-primary/80 transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Subtle menu trigger button - top right */}
      {!menuVisible && !settingsOpen && !notesPanelOpen && (
        <button
          onClick={() => setMenuVisible(true)}
          className="fixed top-3 right-3 z-30 w-10 h-10 flex items-center justify-center rounded-full bg-background/30 hover:bg-background/60 backdrop-blur-sm transition-all opacity-40 hover:opacity-100"
          aria-label="Open menu"
        >
          <MoreHorizontal className="h-5 w-5 text-foreground/60" />
        </button>
      )}

      {/* Quick menu */}
      {menuVisible && !settingsOpen && !notesPanelOpen && (
        <>
          <div
            className="absolute inset-0 z-20"
            onClick={() => setMenuVisible(false)}
          />
          <div className="absolute inset-0 z-20 pointer-events-none">
            <div className="pointer-events-auto absolute top-4 left-1/2 transform -translate-x-1/2">
              <div
                className="flex items-center gap-1 bg-background/95 backdrop-blur-xl rounded-2xl p-1.5 shadow-xl border"
                onClick={(e) => e.stopPropagation()}
              >
                {onBackAction && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      onBackAction();
                      setMenuVisible(false);
                    }}
                    aria-label="Back"
                    className="rounded-xl w-10 h-10"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </Button>
                )}

                <div className="w-px h-6 bg-border/50 mx-1" />

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={zoomOut}
                  aria-label="Zoom out"
                  className="rounded-xl w-10 h-10"
                >
                  <Minus className="h-5 w-5" />
                </Button>

                <span className="min-w-[3rem] text-center text-sm font-medium">
                  {zoomPercent}%
                </span>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={zoomIn}
                  aria-label="Zoom in"
                  className="rounded-xl w-10 h-10"
                >
                  <Plus className="h-5 w-5" />
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    fitToWidth();
                    setMenuVisible(false);
                  }}
                  aria-label="Fit to width"
                  className="rounded-xl w-10 h-10"
                >
                  <Maximize2 className="h-5 w-5" />
                </Button>

                <div className="w-px h-6 bg-border/50 mx-1" />

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setNotesPanelOpen(true);
                    setMenuVisible(false);
                  }}
                  aria-label="Notes"
                  className="rounded-xl w-10 h-10 relative"
                >
                  <StickyNote className="h-5 w-5" />
                  {notes.length > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-primary text-primary-foreground text-[10px] rounded-full flex items-center justify-center px-1">
                      {notes.length}
                    </span>
                  )}
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setSettingsOpen(true);
                    setMenuVisible(false);
                  }}
                  aria-label="Settings"
                  className="rounded-xl w-10 h-10"
                >
                  <Settings className="h-5 w-5" />
                </Button>
              </div>
            </div>

            <div className="pointer-events-none absolute bottom-6 left-1/2 transform -translate-x-1/2">
              <div className="bg-background/95 backdrop-blur-xl rounded-full px-4 py-2 text-sm font-medium shadow-xl border">
                {currentPage} / {totalPages}
              </div>
            </div>
          </div>
        </>
      )}

      {/* PDF Viewport */}
      <div className="absolute inset-0" data-pdf-viewport>
        <Viewport style={{ height: "100%", width: "100%" }}>
          <Scroller
            renderPage={({ width, height, pageIndex }) => (
              <div style={{ width, height }} data-page-index={pageIndex}>
                <CrispRenderLayer
                  pageIndex={pageIndex}
                  baseDpr={devicePixelRatio}
                  isScrolling={isScrolling}
                  isZooming={isZooming}
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
  isZooming,
}: {
  pageIndex: number;
  baseDpr: number;
  isScrolling: boolean;
  isZooming: boolean;
}) {
  const { state } = useZoom();
  const zoom = state?.currentZoomLevel ?? 1;

  // Calculate DPR based on zoom level for crisp rendering
  // Higher zoom = higher DPR needed to maintain sharpness
  let dpr: number;

  if (isScrolling || isZooming) {
    // Lower quality while scrolling/zooming for performance
    // Use slightly higher DPR during zoom to prevent too much blur
    dpr = Math.min(2.5, Math.max(1, baseDpr * Math.min(zoom, 1.5)));
  } else {
    // Full quality when static
    // Scale DPR with zoom: at 2x zoom, we need 2x DPR to maintain sharpness
    const zoomDpr = baseDpr * zoom;
    // Cap at 5 to prevent memory issues, minimum 1
    dpr = Math.min(5, Math.max(1, zoomDpr));
  }

  return <RenderLayer key={pageIndex} pageIndex={pageIndex} dpr={dpr} />;
}
