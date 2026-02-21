"use client";

import { useEffect, useRef, useCallback } from "react";

interface PdfGestureOptions {
  containerRef: React.RefObject<HTMLElement | null>;
  currentZoom: number;
  minZoom: number;
  maxZoom: number;
  onZoomChange: (zoom: number) => void;
  enabled?: boolean;
}

interface TouchState {
  initialDistance: number;
  initialZoom: number;
  lastDistance: number;
  center: { x: number; y: number };
}

// Calculate distance between two touch points
function getDistance(touch1: Touch, touch2: Touch): number {
  const dx = touch1.clientX - touch2.clientX;
  const dy = touch1.clientY - touch2.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

// Calculate center point between two touches
function getCenter(touch1: Touch, touch2: Touch): { x: number; y: number } {
  return {
    x: (touch1.clientX + touch2.clientX) / 2,
    y: (touch1.clientY + touch2.clientY) / 2,
  };
}

export function usePdfGestures({
  containerRef,
  currentZoom,
  minZoom,
  maxZoom,
  onZoomChange,
  enabled = true,
}: PdfGestureOptions) {
  const touchStateRef = useRef<TouchState | null>(null);
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const isPinchingRef = useRef(false);
  const currentZoomRef = useRef(currentZoom);

  // Keep zoom ref updated
  useEffect(() => {
    currentZoomRef.current = currentZoom;
  }, [currentZoom]);

  const clampZoom = useCallback(
    (zoom: number) => Math.max(minZoom, Math.min(maxZoom, zoom)),
    [minZoom, maxZoom]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

    // Handle touch start
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        // Pinch start
        e.preventDefault();
        isPinchingRef.current = true;
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const distance = getDistance(touch1, touch2);

        touchStateRef.current = {
          initialDistance: distance,
          initialZoom: currentZoomRef.current,
          lastDistance: distance,
          center: getCenter(touch1, touch2),
        };
      } else if (e.touches.length === 1) {
        // Single touch - check for double tap
        const now = Date.now();
        const touch = e.touches[0];
        const lastTap = lastTapRef.current;

        if (
          lastTap &&
          now - lastTap.time < 300 &&
          Math.abs(touch.clientX - lastTap.x) < 30 &&
          Math.abs(touch.clientY - lastTap.y) < 30
        ) {
          // Double tap detected
          e.preventDefault();
          const zoom = currentZoomRef.current;
          // Toggle between 1x and 2x zoom
          const newZoom = zoom < 1.5 ? 2 : 1;
          onZoomChange(clampZoom(newZoom));
          lastTapRef.current = null;
        } else {
          lastTapRef.current = { time: now, x: touch.clientX, y: touch.clientY };
        }
      }
    };

    // Handle touch move
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && touchStateRef.current) {
        e.preventDefault();
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const currentDistance = getDistance(touch1, touch2);
        const state = touchStateRef.current;

        // Calculate zoom based on pinch scale
        const scale = currentDistance / state.initialDistance;
        const newZoom = clampZoom(state.initialZoom * scale);

        // Only update if zoom changed meaningfully
        if (Math.abs(newZoom - currentZoomRef.current) > 0.01) {
          onZoomChange(newZoom);
        }

        state.lastDistance = currentDistance;
        state.center = getCenter(touch1, touch2);
      }
    };

    // Handle touch end
    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        // Pinch ended
        if (isPinchingRef.current) {
          isPinchingRef.current = false;
          touchStateRef.current = null;
        }
      }
    };

    // Handle touch cancel
    const handleTouchCancel = () => {
      isPinchingRef.current = false;
      touchStateRef.current = null;
    };

    // Prevent default browser pinch-zoom on the container
    const handleGestureStart = (e: Event) => {
      e.preventDefault();
    };

    const handleGestureChange = (e: Event) => {
      e.preventDefault();
    };

    // Add event listeners with proper options
    container.addEventListener("touchstart", handleTouchStart, { passive: false });
    container.addEventListener("touchmove", handleTouchMove, { passive: false });
    container.addEventListener("touchend", handleTouchEnd, { passive: true });
    container.addEventListener("touchcancel", handleTouchCancel, { passive: true });

    // Safari gesture events
    container.addEventListener("gesturestart", handleGestureStart, { passive: false });
    container.addEventListener("gesturechange", handleGestureChange, { passive: false });

    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
      container.removeEventListener("touchcancel", handleTouchCancel);
      container.removeEventListener("gesturestart", handleGestureStart);
      container.removeEventListener("gesturechange", handleGestureChange);
    };
  }, [containerRef, enabled, onZoomChange, clampZoom]);

  return {
    isPinching: isPinchingRef.current,
  };
}
