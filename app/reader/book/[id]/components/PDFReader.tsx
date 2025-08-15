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

  // Ctrl/⌘ + wheel zoom. Pinch on trackpads usually sends the same wheel+ctrl gesture in modern browsers.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // useZoom works only inside <EmbedPDF>; we dispatch a custom event and let a child handler consume it
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const detail = { dy: e.deltaY, clientY: e.clientY };
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
function ZoomWheelBridge() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const { provides, state } = useZoom();

  useEffect(() => {
    if (!hostRef.current || !provides) return;
    const el = hostRef.current.parentElement as HTMLElement; // Viewport div

    const onWheelCustom = (evt: Event) => {
      const { dy } = (evt as CustomEvent).detail as {
        dy: number;
        clientY: number;
      };
      const factor = dy > 0 ? 1 / 1.1 : 1.1;
      const next = Math.min(
        Math.max((state?.currentZoomLevel || 1) * factor, 0.25),
        5
      );
      provides.requestZoom(next);
    };

    el.addEventListener("epdf-zoom-wheel", onWheelCustom as any);
    return () =>
      el.removeEventListener("epdf-zoom-wheel", onWheelCustom as any);
  }, [provides, state?.currentZoomLevel]);

  return <div ref={hostRef} />;
}
