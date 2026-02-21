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
  lastScale: number;
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
  const contentElRef = useRef<HTMLElement | null>(null);
  const isPinchingRef = useRef(false);
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
    zoomTimeoutRef.current = setTimeout(() => setIsZooming(false), 200);
  }, []);

  // Apply visual transform during pinch
  const applyVisualZoom = useCallback((scale: number, centerX: number, centerY: number, smooth: boolean = false) => {
    const content = contentElRef.current;
    if (content) {
      if (smooth) {
        content.style.transition = 'transform 0.15s ease-out';
      } else {
        content.style.transition = 'none';
      }
      content.style.transformOrigin = `${centerX}px ${centerY}px`;
      content.style.transform = `scale(${scale})`;
      content.style.willChange = 'transform';
    }
  }, []);

  // Reset visual transform with optional animation
  const resetVisualZoom = useCallback((animate: boolean = false) => {
    const content = contentElRef.current;
    if (content) {
      if (animate) {
        content.style.transition = 'transform 0.15s ease-out';
        content.style.transform = 'scale(1)';
        // Clean up after animation
        setTimeout(() => {
          if (content) {
            content.style.transform = '';
            content.style.transformOrigin = '';
            content.style.transition = '';
            content.style.willChange = '';
          }
        }, 160);
      } else {
        content.style.transform = '';
        content.style.transformOrigin = '';
        content.style.transition = '';
        content.style.willChange = '';
      }
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        isPinchingRef.current = true;
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
          lastScale: 1,
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

          // Find content element
          if (!contentElRef.current) {
            contentElRef.current = findContentElement(container);
          }

          const rect = container.getBoundingClientRect();
          const centerX = t.clientX - rect.left;
          const centerY = t.clientY - rect.top;

          const newZoom = clamp(currentZoomRef.current < 1.5 ? 2 : 1);
          const scale = newZoom / currentZoomRef.current;

          // Animate the zoom
          applyVisualZoom(scale, centerX, centerY, true);

          // Apply real zoom after animation
          setTimeout(() => {
            resetVisualZoom(false);
            onZoomChange(newZoom);
            endZoom();
          }, 150);

          lastTapRef.current = null;
        } else {
          lastTapRef.current = { time: now, x: t.clientX, y: t.clientY };
        }
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchRef.current && isPinchingRef.current) {
        e.preventDefault();

        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = getDistance(t1, t2);
        const scale = dist / pinchRef.current.initialDistance;

        // Update center point to follow fingers
        const center = getCenter(t1, t2);
        const rect = container.getBoundingClientRect();
        pinchRef.current.centerX = center.x - rect.left;
        pinchRef.current.centerY = center.y - rect.top;

        // Calculate the target zoom and clamp it
        const targetZoom = clamp(pinchRef.current.initialZoom * scale);
        // Calculate visual scale relative to current actual zoom
        const visualScale = targetZoom / currentZoomRef.current;

        pinchRef.current.lastScale = visualScale;

        // Apply visual transform (smooth, no re-render)
        applyVisualZoom(visualScale, pinchRef.current.centerX, pinchRef.current.centerY, false);
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2 && pinchRef.current && isPinchingRef.current) {
        isPinchingRef.current = false;

        const finalScale = pinchRef.current.lastScale;
        const finalZoom = clamp(currentZoomRef.current * finalScale);
        const zoomChanged = Math.abs(finalZoom - currentZoomRef.current) > 0.01;

        if (zoomChanged) {
          // Animate back to scale(1) while applying real zoom
          resetVisualZoom(true);

          // Apply actual zoom slightly before animation ends for smooth handoff
          setTimeout(() => {
            onZoomChange(finalZoom);
          }, 50);
        } else {
          // No significant zoom change, just reset
          resetVisualZoom(true);
        }

        pinchRef.current = null;
        endZoom();
      }
    };

    const onTouchCancel = () => {
      if (isPinchingRef.current) {
        isPinchingRef.current = false;
        resetVisualZoom(true);
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
