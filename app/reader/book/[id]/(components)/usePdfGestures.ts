"use client";

import { useEffect, useRef, useCallback, useState } from "react";

interface PdfGestureOptions {
  containerRef: React.RefObject<HTMLElement | null>;
  currentZoom: number;
  minZoom: number;
  maxZoom: number;
  onZoomChange: (zoom: number) => void;
  enabled?: boolean;
}

interface PdfGestureResult {
  isZooming: boolean;
}

interface PinchState {
  initialDistance: number;
  initialZoom: number;
  centerX: number;
  centerY: number;
}

function getDistance(t1: Touch, t2: Touch): number {
  const dx = t1.clientX - t2.clientX;
  const dy = t1.clientY - t2.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function getCenter(t1: Touch, t2: Touch): { x: number; y: number } {
  return {
    x: (t1.clientX + t2.clientX) / 2,
    y: (t1.clientY + t2.clientY) / 2,
  };
}

// Find the content element to apply transform to
function findContentElement(container: HTMLElement): HTMLElement | null {
  const viewport = container.querySelector('[data-pdf-viewport]');
  if (viewport) {
    // Find the first child that contains pages
    const firstPage = viewport.querySelector('[data-page-index]');
    if (firstPage && firstPage.parentElement) {
      return firstPage.parentElement as HTMLElement;
    }
  }
  return null;
}

export function usePdfGestures({
  containerRef,
  currentZoom,
  minZoom,
  maxZoom,
  onZoomChange,
  enabled = true,
}: PdfGestureOptions): PdfGestureResult {
  const pinchRef = useRef<PinchState | null>(null);
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const zoomTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentZoomRef = useRef(currentZoom);
  const visualScaleRef = useRef(1);
  const contentElRef = useRef<HTMLElement | null>(null);
  const [isZooming, setIsZooming] = useState(false);

  useEffect(() => {
    currentZoomRef.current = currentZoom;
  }, [currentZoom]);

  const clamp = useCallback(
    (z: number) => Math.max(minZoom, Math.min(maxZoom, z)),
    [minZoom, maxZoom]
  );

  const startZoom = useCallback(() => {
    if (zoomTimeoutRef.current) clearTimeout(zoomTimeoutRef.current);
    setIsZooming(true);
  }, []);

  const endZoom = useCallback(() => {
    if (zoomTimeoutRef.current) clearTimeout(zoomTimeoutRef.current);
    zoomTimeoutRef.current = setTimeout(() => setIsZooming(false), 150);
  }, []);

  // Apply visual transform during pinch (no re-render)
  const applyVisualZoom = useCallback((scale: number, centerX: number, centerY: number) => {
    const content = contentElRef.current;
    if (content) {
      visualScaleRef.current = scale;
      content.style.transformOrigin = `${centerX}px ${centerY}px`;
      content.style.transform = `scale(${scale})`;
    }
  }, []);

  // Reset visual transform
  const resetVisualZoom = useCallback(() => {
    const content = contentElRef.current;
    if (content) {
      content.style.transform = '';
      content.style.transformOrigin = '';
      visualScaleRef.current = 1;
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        startZoom();

        // Find content element for visual transform
        if (!contentElRef.current) {
          contentElRef.current = findContentElement(container);
        }

        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const center = getCenter(t1, t2);
        const rect = container.getBoundingClientRect();

        pinchRef.current = {
          initialDistance: getDistance(t1, t2),
          initialZoom: currentZoomRef.current,
          centerX: center.x - rect.left,
          centerY: center.y - rect.top,
        };
      } else if (e.touches.length === 1) {
        // Double tap detection
        const now = Date.now();
        const t = e.touches[0];
        const last = lastTapRef.current;

        if (
          last &&
          now - last.time < 300 &&
          Math.abs(t.clientX - last.x) < 30 &&
          Math.abs(t.clientY - last.y) < 30
        ) {
          e.preventDefault();
          startZoom();
          const newZoom = clamp(currentZoomRef.current < 1.5 ? 2 : 1);
          onZoomChange(newZoom);
          endZoom();
          lastTapRef.current = null;
        } else {
          lastTapRef.current = { time: now, x: t.clientX, y: t.clientY };
        }
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault();

        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = getDistance(t1, t2);
        const scale = dist / pinchRef.current.initialDistance;

        // Calculate the target zoom
        const targetZoom = clamp(pinchRef.current.initialZoom * scale);
        // Calculate visual scale relative to current zoom
        const visualScale = targetZoom / currentZoomRef.current;

        // Apply visual transform (smooth, no re-render)
        applyVisualZoom(visualScale, pinchRef.current.centerX, pinchRef.current.centerY);
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2 && pinchRef.current) {
        // Calculate final zoom
        const finalScale = visualScaleRef.current;
        const finalZoom = clamp(currentZoomRef.current * finalScale);

        // Reset visual transform first
        resetVisualZoom();

        // Apply actual zoom
        if (Math.abs(finalZoom - currentZoomRef.current) > 0.01) {
          onZoomChange(finalZoom);
        }

        pinchRef.current = null;
        endZoom();
      }
    };

    const onTouchCancel = () => {
      if (pinchRef.current) {
        resetVisualZoom();
        pinchRef.current = null;
        endZoom();
      }
    };

    // Prevent Safari gestures
    const prevent = (e: Event) => e.preventDefault();

    container.addEventListener("touchstart", onTouchStart, { passive: false });
    container.addEventListener("touchmove", onTouchMove, { passive: false });
    container.addEventListener("touchend", onTouchEnd, { passive: true });
    container.addEventListener("touchcancel", onTouchCancel, { passive: true });
    container.addEventListener("gesturestart", prevent, { passive: false });
    container.addEventListener("gesturechange", prevent, { passive: false });

    return () => {
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEnd);
      container.removeEventListener("touchcancel", onTouchCancel);
      container.removeEventListener("gesturestart", prevent);
      container.removeEventListener("gesturechange", prevent);
      if (zoomTimeoutRef.current) clearTimeout(zoomTimeoutRef.current);
    };
  }, [containerRef, enabled, onZoomChange, clamp, startZoom, endZoom, applyVisualZoom, resetVisualZoom]);

  return { isZooming };
}
