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
} from "lucide-react";

// Essential plugins
import { ViewportPluginPackage } from "@embedpdf/plugin-viewport";
import { Viewport } from "@embedpdf/plugin-viewport/react";
import { ScrollPluginPackage } from "@embedpdf/plugin-scroll";
import { Scroller } from "@embedpdf/plugin-scroll/react";
import { LoaderPluginPackage } from "@embedpdf/plugin-loader";
import { RenderPluginPackage } from "@embedpdf/plugin-render";
import { RenderLayer } from "@embedpdf/plugin-render/react";

// Zoom (wheel+Ctrl/⌘ and programmatic controls)
import { ZoomPluginPackage } from "@embedpdf/plugin-zoom";
import { useZoom } from "@embedpdf/plugin-zoom/react";

import { IBook } from "@/app/reader/types";
import PDFReaderMenu from "./PDFReaderMenu";

type Props = {
  book: IBook;
  onBackAction?: () => void;
};

// Top bar is hidden to match EPUB reader clean design

export default function VirtualPDFReader({ book, onBackAction }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const url = book.fileUrl;
  const [, setRenderKey] = useState(0);
  const [devicePixelRatio, setDevicePixelRatio] = useState(1);
  const [menuVisible, setMenuVisible] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // PDF Settings state to match EPUB reader functionality with persistence
  const [pdfSettings, setPdfSettings] = useState(() => {
    const defaultSettings = {
      zoom: 100,
      rotation: 0 as 0 | 90 | 180 | 270,
      viewMode: "single" as "single" | "double" | "continuous",
      fitMode: "width" as "width" | "height" | "page" | "auto",
      theme: "sepia" as "light" | "dark" | "sepia",
      showThumbnails: false,
      showBookmarks: false,
      invertColors: false,
      enableTextSelection: true,
      enableAnnotations: true,
      pageSpacing: 10,
      backgroundColor: "#f4ecd8",
    };

    if (typeof window !== "undefined") {
      const savedTheme = localStorage.getItem("pdf.theme") as
        | "light"
        | "dark"
        | "sepia"
        | null;
      const savedBg = localStorage.getItem("pdf.backgroundColor");

      if (savedTheme && savedBg) {
        return {
          ...defaultSettings,
          theme: savedTheme,
          backgroundColor: savedBg,
        };
      }
    }

    return defaultSettings;
  });

  // Initialize the PDFium engine. By default, the WASM binary is loaded from the package CDN.
  // For production, host it yourself and pass { wasmUrl } to usePdfiumEngine().
  const { engine, isLoading, error } = usePdfiumEngine();

  const [isScrolling, setIsScrolling] = useState(false);

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
  }, []);

  // 4) Make DPR watcher robust when moving between monitors
  useEffect(() => {
    if (typeof window === "undefined") return;
    let mql: MediaQueryList | null = null;
    let raf = 0;

    const onChange = () => {
      setDevicePixelRatio(window.devicePixelRatio || 1);
      setRenderKey((k) => k + 1);
      raf = window.requestAnimationFrame(watch); // re-arm for the new DPR
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
    if (!url) return [] as any[];
    return [
      createPluginRegistration(LoaderPluginPackage, {
        loadingOptions: {
          type: "url",
          pdfFile: { id: book.id || "doc", url },
        },
      }),
      createPluginRegistration(ViewportPluginPackage),
      createPluginRegistration(ScrollPluginPackage),
      createPluginRegistration(RenderPluginPackage),
      createPluginRegistration(ZoomPluginPackage),
    ];
  }, [url, book.id]);

  // Enhanced wheel and touch-pad zoom support with touch sensitivity fix
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      // Detect different types of zoom gestures
      const isModifierZoom = e.ctrlKey || e.metaKey;

      if (isModifierZoom) {
        e.preventDefault();

        // Pass detailed information about the wheel event
        const detail = {
          dy: e.deltaY,
          clientY: e.clientY,
          deltaMode: e.deltaMode,
          ctrlKey: e.ctrlKey,
          metaKey: e.metaKey,
        };

        el.dispatchEvent(new CustomEvent("epdf-zoom-wheel", { detail }));
      }
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel as any);
  }, []);

  // Touch gesture support with reduced sensitivity
  useGesture(
    {
      onPinch: ({ da: [d], origin: [ox, oy] }) => {
        // Further reduced sensitivity for touch zoom
        const factor = d > 1 ? 1.005 : 0.995; // Even smaller increment for less sensitive zooming
        const currentZoom = pdfSettings.zoom;
        const nextZoom = Math.max(
          25,
          Math.min(300, Math.round(currentZoom * factor))
        );

        if (nextZoom !== currentZoom) {
          setPdfSettings((prev) => ({ ...prev, zoom: nextZoom }));
        }
      },
    },
    {
      target: containerRef,
      eventOptions: { passive: true },
      pinch: {
        threshold: [0.05, 0], // Much higher threshold for less sensitivity
        rubberband: 0.2, // More resistance at zoom limits
      },
    }
  );

  // Auto-hide menu after interaction
  const hideMenuAfterDelay = () => {
    setTimeout(() => setMenuVisible(false), 3000);
  };

  // Handle settings changes with persistence
  const handleSettingsChange = useCallback((newSettings: any) => {
    setPdfSettings((prev) => {
      const updated = { ...prev, ...newSettings };

      // Persist theme and background color
      if (typeof window !== "undefined") {
        if (newSettings.theme) {
          localStorage.setItem("pdf.theme", newSettings.theme);
        }
        if (newSettings.backgroundColor) {
          localStorage.setItem(
            "pdf.backgroundColor",
            newSettings.backgroundColor
          );
        }
      }

      return updated;
    });
  }, []);

  if (error) {
    return (
      <div className="flex h-[100dvh] w-full items-center justify-center bg-gray-50">
        <div className="text-center space-y-2">
          <div className="text-red-600 text-4xl">⚠️</div>
          <div className="text-sm text-gray-700">Failed to init PDF engine</div>
          <div className="text-xs text-gray-500">{String(error)}</div>
        </div>
      </div>
    );
  }

  if (isLoading || !engine || !url) {
    return (
      <div className="flex h-[100dvh] w-full items-center justify-center bg-gray-50">
        <div className="text-center space-y-2">
          <div className="animate-pulse text-gray-600">Loading PDF…</div>
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
        if (!menuVisible && !settingsOpen) {
          setMenuVisible(true);
        }
      }}
    >
      {/* Quick menu overlay - simple and minimal */}
      {menuVisible && !settingsOpen && (
        <>
          {/* Backdrop to close menu when clicking outside */}
          <div
            className="absolute inset-0 z-20"
            onClick={() => setMenuVisible(false)}
          />
          <div className="absolute inset-0 z-20 pointer-events-none">
            {/* Simple centered quick menu */}
            <div className="pointer-events-auto absolute top-2 left-1/2 transform -translate-x-1/2">
              <div
                className="flex items-center gap-2 bg-background/95 rounded-full p-2 shadow-xl border"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Back */}
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

                {/* Previous page */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    // TODO: Implement page navigation
                    hideMenuAfterDelay();
                  }}
                  aria-label="Previous page"
                  className="rounded-full"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>

                {/* Next page */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    // TODO: Implement page navigation
                    hideMenuAfterDelay();
                  }}
                  aria-label="Next page"
                  className="rounded-full"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>

                {/* Zoom controls */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const newZoom = Math.max(25, pdfSettings.zoom - 25);
                    setPdfSettings((prev) => ({ ...prev, zoom: newZoom }));
                    hideMenuAfterDelay();
                  }}
                  aria-label="Zoom out"
                  className="rounded-full"
                >
                  <Minus className="h-4 w-4" />
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const newZoom = Math.min(300, pdfSettings.zoom + 25);
                    setPdfSettings((prev) => ({ ...prev, zoom: newZoom }));
                    hideMenuAfterDelay();
                  }}
                  aria-label="Zoom in"
                  className="rounded-full"
                >
                  <Plus className="h-4 w-4" />
                </Button>

                {/* Settings */}
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

            {/* Simple page indicator */}
            <div className="pointer-events-none absolute bottom-4 left-1/2 transform -translate-x-1/2">
              <div className="bg-background/95 rounded-full px-3 py-1 text-xs shadow-xl">
                Page {currentPage} of {totalPages}
              </div>
            </div>
          </div>
        </>
      )}

      {/* PDF Reader */}
      <div className="absolute inset-0">
        <div
          className="h-full w-full transition-colors duration-200"
          style={{ backgroundColor: pdfSettings.backgroundColor }}
        >
          <EmbedPDF engine={engine} plugins={plugins}>
            <Viewport
              style={{
                height: "100%",
                width: "100%",
                backgroundColor: pdfSettings.backgroundColor,
              }}
              onPointerDownCapture={() => {
                /* keep React happy */
              }}
            >
              {/* Local handler that bridges our custom wheel event to the zoom plugin */}
              <ZoomWheelBridge
                onZoomSettle={() => {
                  // Trigger crisp re-render with current device pixel ratio
                  setRenderKey((prev) => prev + 1);
                }}
              />

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
          </EmbedPDF>
        </div>
      </div>

      {/* PDFReaderMenu */}
      {settingsOpen && (
        <PDFReaderMenu
          settings={pdfSettings}
          onSettingsChange={handleSettingsChange}
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={(page) => {
            setCurrentPage(page);
            // TODO: Implement actual page navigation
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}

// Simplified zoom gesture handler with improved sensitivity
function ZoomWheelBridge({ onZoomSettle }: { onZoomSettle?: () => void }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const { provides, state } = useZoom();
  const zoomTimeoutRef = useRef<NodeJS.Timeout>(null);

  useEffect(() => {
    if (!hostRef.current || !provides) return;
    const el = hostRef.current.parentElement as HTMLElement;

    const clamp = (z: number) => Math.min(Math.max(z, 0.25), 5);

    // Direct wheel event handling with improved sensitivity
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();

      // Improved zoom calculation with better sensitivity
      const sensitivity = 0.05; // Reduced from 0.1 to make it less jumpy
      const factor = e.deltaY > 0 ? 1 - sensitivity : 1 + sensitivity;
      const currentZoom = state?.currentZoomLevel ?? 1;
      const next = clamp(currentZoom * factor);

      provides.requestZoom(next);

      // Trigger zoom settle callback after a delay
      if (onZoomSettle) {
        if (zoomTimeoutRef.current) {
          clearTimeout(zoomTimeoutRef.current);
        }
        zoomTimeoutRef.current = setTimeout(onZoomSettle, 300);
      }
    };

    // Handle custom zoom events from the outer wheel handler
    const onZoomCustom = (evt: Event) => {
      const detail = (evt as CustomEvent).detail;

      const sensitivity = 0.05;
      const factor = detail.dy > 0 ? 1 - sensitivity : 1 + sensitivity;
      const currentZoom = state?.currentZoomLevel ?? 1;
      const next = clamp(currentZoom * factor);

      provides.requestZoom(next);

      // Trigger zoom settle callback after a delay
      if (onZoomSettle) {
        if (zoomTimeoutRef.current) {
          clearTimeout(zoomTimeoutRef.current);
        }
        zoomTimeoutRef.current = setTimeout(onZoomSettle, 300);
      }
    };

    // Add both direct wheel handling and custom event handling
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("epdf-zoom-wheel", onZoomCustom);

    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("epdf-zoom-wheel", onZoomCustom);
      if (zoomTimeoutRef.current) {
        clearTimeout(zoomTimeoutRef.current);
      }
    };
  }, [provides, state?.currentZoomLevel, onZoomSettle]);

  return <div ref={hostRef} />;
}

// 1) Replace your <RenderLayer ... dpr={devicePixelRatio} /> usage
//    with a zoom-aware wrapper that multiplies DPR by current zoom
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

  // Low DPR during motion, higher when settled. Cap to avoid huge canvases.
  const dpr = isScrolling
    ? Math.min(2, Math.max(1, baseDpr)) // cheap while moving
    : Math.min(3, Math.max(1, baseDpr * Math.min(2, zoom))); // sharper at rest

  return <RenderLayer key={pageIndex} pageIndex={pageIndex} dpr={dpr} />;
}
