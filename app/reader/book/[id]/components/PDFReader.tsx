"use client";

import { useMemo, useRef, useEffect } from "react";
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

  // Initialize the PDFium engine. By default, the WASM binary is loaded from the package CDN.
  // For production, host it yourself and pass { wasmUrl } to usePdfiumEngine().
  const { engine, isLoading, error } = usePdfiumEngine();

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
            <ZoomWheelBridge />

            <Scroller
              renderPage={({ width, height, pageIndex }) => (
                <div style={{ width, height }}>
                  <RenderLayer pageIndex={pageIndex} />
                </div>
              )}
            />
          </Viewport>
        </EmbedPDF>
      </div>
    </div>
  );
}

// Component must live inside <EmbedPDF> to access useZoom()
// Inside your file, replace ZoomWheelBridge with this:

// 2) Use this ZoomWheelBridge:

function ZoomWheelBridge() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const { provides, state } = useZoom();

  const baseZoomRef = useRef(1);
  const startDistRef = useRef<number | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());

  useEffect(() => {
    if (!hostRef.current || !provides) return;

    // The immediate parent is the <Viewport> host element.
    const el = hostRef.current.parentElement as HTMLElement;

    const clamp = (z: number) => Math.min(Math.max(z, 0.25), 5);

    // --- Chrome/Edge/Firefox trackpad pinch -> wheel+ctrl ---
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();

      // Smooth exponential scaling. Negative deltaY = zoom in.
      const k = 1.0015;
      const factor = Math.pow(k, -e.deltaY);
      const next = clamp((state?.currentZoomLevel ?? 1) * factor);
      provides.requestZoom(next);
    };

    // --- Safari trackpad pinch (non-standard gesture events) ---
    const onGestureStart = (e: any) => {
      e.preventDefault();
      baseZoomRef.current = state?.currentZoomLevel ?? 1;
    };
    const onGestureChange = (e: any) => {
      e.preventDefault();
      const next = clamp(baseZoomRef.current * (e.scale || 1));
      provides.requestZoom(next);
    };

    // --- Touchscreen pinch (PointerEvents) ---
    const dist = () => {
      const pts = Array.from(pointers.current.values());
      if (pts.length < 2) return 0;
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      return Math.hypot(dx, dy);
    };

    const onPointerDown = (e: PointerEvent) => {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.current.size === 2) {
        baseZoomRef.current = state?.currentZoomLevel ?? 1;
        startDistRef.current = dist();
        (el.style as any).touchAction = "none";
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.current.size === 2 && startDistRef.current) {
        const s = startDistRef.current;
        const c = dist();
        if (s > 0 && c > 0) {
          const scale = c / s;
          const next = clamp(baseZoomRef.current * scale);
          provides.requestZoom(next);
        }
      }
    };

    const endPinch = () => {
      if (pointers.current.size < 2) {
        startDistRef.current = null;
        (el.style as any).touchAction = "";
      }
    };
    const onPointerUp = (e: PointerEvent) => {
      pointers.current.delete(e.pointerId);
      endPinch();
    };
    const onPointerCancel = (e: PointerEvent) => {
      pointers.current.delete(e.pointerId);
      endPinch();
    };

    // Bind listeners
    el.addEventListener("wheel", onWheel as any, { passive: false } as any);
    el.addEventListener(
      "gesturestart",
      onGestureStart as any,
      { passive: false } as any
    );
    el.addEventListener(
      "gesturechange",
      onGestureChange as any,
      { passive: false } as any
    );
    el.addEventListener("pointerdown", onPointerDown as any);
    el.addEventListener("pointermove", onPointerMove as any);
    el.addEventListener("pointerup", onPointerUp as any);
    el.addEventListener("pointercancel", onPointerCancel as any);
    el.addEventListener("pointerleave", onPointerUp as any);

    return () => {
      el.removeEventListener("wheel", onWheel as any);
      el.removeEventListener("gesturestart", onGestureStart as any);
      el.removeEventListener("gesturechange", onGestureChange as any);
      el.removeEventListener("pointerdown", onPointerDown as any);
      el.removeEventListener("pointermove", onPointerMove as any);
      el.removeEventListener("pointerup", onPointerUp as any);
      el.removeEventListener("pointercancel", onPointerCancel as any);
      el.removeEventListener("pointerleave", onPointerUp as any);
    };
  }, [provides, state?.currentZoomLevel]);

  // Empty child anchors us inside <Viewport>
  return <div ref={hostRef} />;
}
