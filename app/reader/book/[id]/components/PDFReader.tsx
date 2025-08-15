"use client";

import { useMemo, useRef, useEffect, useState } from "react";
import { createPluginRegistration } from "@embedpdf/core";
import { EmbedPDF } from "@embedpdf/core/react";
import { usePdfiumEngine } from "@embedpdf/engines/react";

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

type Props = { book: IBook };

// Small toolbar using the zoom plugin
function TopBar({ title }: { title?: string }) {
  const { provides, state } = useZoom();

  if (!provides)
    return (
      <div className="flex items-center gap-2 border-b p-2 text-sm">
        <div className="text-muted-foreground truncate">{title || "PDF"}</div>
      </div>
    );

  return (
    <div className="flex items-center justify-between gap-2 border-b p-2 text-sm bg-white">
      <div className="flex items-center gap-2">
        <button
          className="px-2 py-1 border rounded"
          onClick={() => provides.zoomOut()}
          aria-label="Zoom out"
        >
          -
        </button>
        <div className="w-16 text-center">
          {Math.round((state?.currentZoomLevel || 1) * 100)}%
        </div>
        <button
          className="px-2 py-1 border rounded"
          onClick={() => provides.zoomIn()}
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          className="px-2 py-1 border rounded"
          onClick={() => provides.requestZoom(1)}
          aria-label="Reset zoom"
        >
          100%
        </button>
      </div>
      <div className="text-muted-foreground truncate">{title || "PDF"}</div>
    </div>
  );
}

export default function VirtualPDFReader({ book }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const url = book.fileUrl;
  const [renderKey, setRenderKey] = useState(0);
  const [devicePixelRatio, setDevicePixelRatio] = useState(1);

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

  // Enhanced wheel and trackpad zoom support
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
    <div className="flex h-[100dvh] w-full flex-col">
      <TopBar title={book.title} />

      <div ref={containerRef} className="flex-1 overflow-hidden bg-muted/20">
        <EmbedPDF engine={engine} plugins={plugins}>
          <Viewport
            style={{
              height: "100%",
              width: "100%",
              backgroundColor: "#f6f7f9",
            }}
            // Handle wheel+ctrl zoom inside the provider using the plugin's hook
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
  );
}

// Simplified zoom gesture handler
function ZoomWheelBridge({ onZoomSettle }: { onZoomSettle?: () => void }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const { provides, state } = useZoom();
  const zoomTimeoutRef = useRef<NodeJS.Timeout>(null);

  useEffect(() => {
    if (!hostRef.current || !provides) return;
    const el = hostRef.current.parentElement as HTMLElement;

    const clamp = (z: number) => Math.min(Math.max(z, 0.25), 5);

    // Direct wheel event handling
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();

      // Simple zoom calculation
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
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

      const factor = detail.dy > 0 ? 0.9 : 1.1;
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
