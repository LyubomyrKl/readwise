import { useEffect, useRef, useCallback, useState } from "react";
import { useBookMutations } from "@tools/reader/documents/useBookMutations";
import { apiFetch } from "@/lib/fetcher";
import type { ReadingPosition } from "@/lib/types";

type UseReadingSessionOptions = {
  bookId: string;
  /** Initial reading position from book data */
  initialPosition?: ReadingPosition | null;
  /** Interval in ms to auto-save progress (default: 30 seconds) */
  autoSaveInterval?: number;
  /** Whether to update last accessed on mount (default: true) */
  updateLastAccessedOnMount?: boolean;
};

/**
 * Hook for tracking reading sessions with automatic time and position persistence.
 *
 * Features:
 * - Tracks elapsed reading time
 * - Tracks and persists reading position (page for PDF, CFI for EPUB)
 * - Auto-saves progress at configurable intervals
 * - Saves on page visibility change (tab switch, minimize)
 * - Saves on unmount (leaving reader)
 * - Updates last accessed timestamp on mount
 */
export function useReadingSession({
  bookId,
  initialPosition,
  autoSaveInterval = 30_000,
  updateLastAccessedOnMount = true,
}: UseReadingSessionOptions) {
  const { updateSpentTime, updateLastAccessed } = useBookMutations();

  const sessionStartTime = useRef<number>(Date.now());
  const lastSaveTime = useRef<number>(Date.now());
  const isMounted = useRef(true);
  const hasUpdatedLastAccessed = useRef(false);

  // Position tracking
  const [position, setPositionState] = useState<ReadingPosition | null>(initialPosition || null);
  const positionRef = useRef<ReadingPosition | null>(initialPosition || null);
  const lastSavedPositionRef = useRef<string | null>(
    initialPosition ? JSON.stringify(initialPosition) : null
  );
  const initializedFromPropsRef = useRef(false);

  // Sync position when initialPosition prop changes from undefined to a value
  useEffect(() => {
    if (initialPosition && !initializedFromPropsRef.current) {
      initializedFromPropsRef.current = true;
      positionRef.current = initialPosition;
      setPositionState(initialPosition);
      lastSavedPositionRef.current = JSON.stringify(initialPosition);
    }
  }, [initialPosition]);

  // Calculate elapsed time since last save (in hours)
  const getElapsedHours = useCallback(() => {
    const now = Date.now();
    const elapsedMs = now - lastSaveTime.current;
    return elapsedMs / (1000 * 60 * 60); // Convert to hours
  }, []);

  // Save position to backend
  const savePosition = useCallback(async () => {
    const currentPosition = positionRef.current;
    if (!currentPosition) return;

    const positionString = JSON.stringify(currentPosition);
    // Skip if position hasn't changed
    if (positionString === lastSavedPositionRef.current) return;

    try {
      await apiFetch("POST", "/api/books/readingPosition", {
        bookId,
        position: currentPosition,
      });
      lastSavedPositionRef.current = positionString;
    } catch (error) {
      console.error("Failed to save reading position:", error);
    }
  }, [bookId]);

  // Save progress to backend (time + position)
  const saveProgress = useCallback(async () => {
    const elapsedHours = getElapsedHours();

    // Save time if at least 1 second has passed
    if (elapsedHours >= 1 / 3600) {
      await updateSpentTime(bookId, elapsedHours);
      lastSaveTime.current = Date.now();
    }

    // Always try to save position
    await savePosition();
  }, [bookId, getElapsedHours, updateSpentTime, savePosition]);

  // Update current position
  const setPosition = useCallback((newPosition: ReadingPosition) => {
    positionRef.current = newPosition;
    setPositionState(newPosition);
  }, []);

  // Force save (call this before navigation)
  const forceSave = useCallback(async () => {
    await saveProgress();
  }, [saveProgress]);

  // Update last accessed on mount (only once)
  useEffect(() => {
    if (updateLastAccessedOnMount && !hasUpdatedLastAccessed.current) {
      hasUpdatedLastAccessed.current = true;
      updateLastAccessed(bookId);
    }
  }, [bookId, updateLastAccessed, updateLastAccessedOnMount]);

  // Auto-save interval
  useEffect(() => {
    const interval = setInterval(() => {
      if (isMounted.current) {
        saveProgress();
      }
    }, autoSaveInterval);

    return () => clearInterval(interval);
  }, [autoSaveInterval, saveProgress]);

  // Save on visibility change (user switches tab or minimizes)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        saveProgress();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [saveProgress]);

  // Save on unmount
  useEffect(() => {
    isMounted.current = true;

    return () => {
      isMounted.current = false;
      // Use sendBeacon for reliable unmount save
      const elapsedHours = (Date.now() - lastSaveTime.current) / (1000 * 60 * 60);
      if (elapsedHours >= 1 / 3600) {
        // Fallback: try regular save
        saveProgress();
      }
    };
  }, [saveProgress]);

  // Save on beforeunload (page refresh/close)
  useEffect(() => {
    const handleBeforeUnload = () => {
      const elapsedHours = (Date.now() - lastSaveTime.current) / (1000 * 60 * 60);

      // Save time spent
      if (elapsedHours >= 1 / 3600) {
        const timePayload = JSON.stringify({
          bookId,
          amount: elapsedHours,
        });
        navigator.sendBeacon("/api/books/updateSpentTime", timePayload);
      }

      // Save position
      const currentPosition = positionRef.current;
      if (currentPosition) {
        const positionPayload = JSON.stringify({
          bookId,
          position: currentPosition,
        });
        navigator.sendBeacon("/api/books/readingPosition", positionPayload);
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [bookId]);

  return {
    position,
    setPosition,
    forceSave,
    sessionStartTime: sessionStartTime.current,
  };
}
