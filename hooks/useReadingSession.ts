import { useEffect, useRef, useCallback } from "react";
import { useBookMutations } from "./useBookMutations";

type UseReadingSessionOptions = {
  bookId: string;
  /** Interval in ms to auto-save progress (default: 30 seconds) */
  autoSaveInterval?: number;
  /** Whether to update last accessed on mount (default: true) */
  updateLastAccessedOnMount?: boolean;
};

/**
 * Hook for tracking reading sessions with automatic time persistence.
 *
 * Features:
 * - Tracks elapsed reading time
 * - Auto-saves progress at configurable intervals
 * - Saves on page visibility change (tab switch, minimize)
 * - Saves on unmount (leaving reader)
 * - Updates last accessed timestamp on mount
 */
export function useReadingSession({
  bookId,
  autoSaveInterval = 30_000,
  updateLastAccessedOnMount = true,
}: UseReadingSessionOptions) {
  const { updateSpentTime, updateLastAccessed } = useBookMutations();

  const sessionStartTime = useRef<number>(Date.now());
  const lastSaveTime = useRef<number>(Date.now());
  const isMounted = useRef(true);

  // Calculate elapsed time since last save (in hours)
  const getElapsedHours = useCallback(() => {
    const now = Date.now();
    const elapsedMs = now - lastSaveTime.current;
    return elapsedMs / (1000 * 60 * 60); // Convert to hours
  }, []);

  // Save progress to backend
  const saveProgress = useCallback(async () => {
    const elapsedHours = getElapsedHours();

    // Only save if at least 1 second has passed (avoid spam)
    if (elapsedHours < 1 / 3600) return;

    await updateSpentTime(bookId, elapsedHours);
    lastSaveTime.current = Date.now();
  }, [bookId, getElapsedHours, updateSpentTime]);

  // Update current page (kept for potential future use)
  const setCurrentPage = useCallback(() => {
    // Page tracking - can be extended for progress persistence
  }, []);

  // Force save (call this before navigation)
  const forceSave = useCallback(async () => {
    await saveProgress();
  }, [saveProgress]);

  // Update last accessed on mount
  useEffect(() => {
    if (updateLastAccessedOnMount) {
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
      if (elapsedHours >= 1 / 3600) {
        // Use sendBeacon for reliable save on page close
        const payload = JSON.stringify({
          bookId,
          amount: elapsedHours,
        });
        navigator.sendBeacon("/api/books/updateSpentTime", payload);
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [bookId]);

  return {
    setCurrentPage,
    forceSave,
    sessionStartTime: sessionStartTime.current,
  };
}
