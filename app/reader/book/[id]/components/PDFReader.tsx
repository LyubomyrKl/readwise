"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useGesture } from "@use-gesture/react";
import * as pdfjs from "pdfjs-dist";
import { GlobalWorkerOptions } from "pdfjs-dist";

GlobalWorkerOptions.workerPort ||= new Worker("/pdf.worker.mjs", {
  type: "module",
});

type Props = {
  book: {
    id: string;
    title?: string;
    author?: string;
    fileUrl?: string;
    pagePassCount?: number;
    pageCount?: number;
    spentHours?: number;
  };
};

export default function VirtualPDFReader({ book }: Props) {
  const url = book.fileUrl;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [doc, setDoc] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [count, setCount] = useState(0);
  const [dims, setDims] = useState<{ w: number; h: number }[]>([]);
  const [scale, setScale] = useState(1); // zoom
  const [rotation, setRotation] = useState(0); // 0/90/180/270
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

  // Load PDF
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    (async () => {
      const task = pdfjs.getDocument({ url });
      const pdf = await task.promise;
      if (cancelled) return;
      setDoc(pdf);
      setCount(pdf.numPages);
      // pre-read natural page sizes (scale=1)
      const sizes: { w: number; h: number }[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const p = await pdf.getPage(i);
        const vp = p.getViewport({ scale: 1, rotation });
        sizes.push({ w: vp.width, h: vp.height });
      }
      if (!cancelled) setDims(sizes);
    })().catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [url, rotation]);

  // Virtualizer
  const rowVirtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => (dims[index]?.h || 1000) * scale + 24, // padding
    overscan: 6,
    measureElement: (el) => el?.getBoundingClientRect().height ?? 0,
  });

  // Pinch + wheel zoom
  const clamp = (v: number, lo: number, hi: number) =>
    Math.min(Math.max(v, lo), hi);
  const setZoomAroundPoint = useCallback(
    (nextScale: number, clientY: number) => {
      const el = scrollRef.current;
      if (!el) return setScale(nextScale);
      const prevScale = scale;
      const rect = el.getBoundingClientRect();
      const y = el.scrollTop + (clientY - rect.top); // content Y at cursor
      const ratio = y / (el.scrollHeight || 1);
      setScale(nextScale);
      // After React applies scale, scrollHeight changes. Use timeout to adjust.
      requestAnimationFrame(() => {
        const newScroll = ratio * el.scrollHeight;
        el.scrollTo({ top: newScroll - (clientY - rect.top) });
      });
    },
    [scale]
  );

  useGesture(
    {
      onWheel: ({ event, ctrlKey, metaKey, delta: [, dy] }) => {
        const e = event as WheelEvent;
        if (ctrlKey || metaKey) {
          e.preventDefault();
          const factor = dy > 0 ? 1 / 1.1 : 1.1;
          setZoomAroundPoint(clamp(scale * factor, 0.25, 5), e.clientY);
        }
      },
      onPinch: ({ event, da: [d], origin: [, oy] }) => {
        const e = event as any;
        e.preventDefault?.();
        // Gesture gives relative distance. Use a mild mapping.
        const factor = d > 0 ? 1.02 : 0.98;
        setZoomAroundPoint(clamp(scale * factor, 0.25, 5), oy);
      },
    },
    { target: scrollRef, eventOptions: { passive: false } }
  );

  // Render a page to a canvas
  const renderPage = useCallback(
    async (pageNum: number, canvas: HTMLCanvasElement) => {
      if (!doc) return;
      const page = await doc.getPage(pageNum);
      const vp = page.getViewport({ scale, rotation });
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      canvas.width = Math.floor(vp.width * dpr);
      canvas.height = Math.floor(vp.height * dpr);
      canvas.style.width = `${vp.width}px`;
      canvas.style.height = `${vp.height}px`;
      const transform = dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined;
      await page.render({
        canvasContext: ctx as any,
        canvas,
        viewport: vp,
        transform,
      }).promise;
    },
    [doc, scale, rotation, dpr]
  );

  return (
    <div className="flex h-[100dvh] w-full flex-col">
      {/* Top bar (add buttons as needed) */}
      <div className="flex items-center gap-2 border-b p-2 text-sm">
        <button
          className="px-2 py-1 border rounded"
          onClick={() => setScale((s) => clamp(s / 1.1, 0.25, 5))}
        >
          -
        </button>
        <div className="w-16 text-center">{Math.round(scale * 100)}%</div>
        <button
          className="px-2 py-1 border rounded"
          onClick={() => setScale((s) => clamp(s * 1.1, 0.25, 5))}
        >
          +
        </button>
        <button
          className="px-2 py-1 border rounded"
          onClick={() => setRotation((r) => (r + 90) % 360)}
        >
          Rotate
        </button>
        <div className="ml-2 text-muted-foreground truncate">
          {book.title || "PDF"}
        </div>
      </div>

      {/* Scroll area */}
      <div ref={scrollRef} className="flex-1 overflow-auto bg-muted/20">
        <div
          style={{
            height: rowVirtualizer.getTotalSize(),
            position: "relative",
          }}
        >
          {rowVirtualizer.getVirtualItems().map((vi) => {
            const index = vi.index; // 0-based
            const pageNum = index + 1; // PDF is 1-based
            const height = (dims[index]?.h || 1000) * scale;
            return (
              <div
                key={vi.key}
                ref={rowVirtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${vi.start}px)`,
                  padding: "12px 0",
                  display: "flex",
                  justifyContent: "center",
                }}
              >
                <canvas
                  style={{
                    boxShadow: "0 0 8px rgba(0,0,0,0.06)",
                    background: "white",
                  }}
                  width={0}
                  height={0}
                  ref={(el) => {
                    if (!el) return;
                    // render when element enters
                    // avoid thrash: queue microtask
                    queueMicrotask(() => renderPage(pageNum, el));
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
