import { useCallback, useRef } from "react";
import { apiFetch } from "@/lib/fetcher";

type BookMutationCallbacks = {
  onFavoriteChange?: (bookId: string, isFavorite: boolean) => void;
  onDeleteSuccess?: (bookId: string) => void;
  onError?: (error: Error) => void;
};

/**
 * Hook for book mutations with optimistic updates and error handling.
 * Provides clean API for favorite, time tracking, and last accessed updates.
 */
export function useBookMutations(callbacks?: BookMutationCallbacks) {
  const pendingRequests = useRef<Map<string, AbortController>>(new Map());

  const setFavorite = useCallback(
    async (bookId: string, isFavorite: boolean) => {
      // Cancel any pending request for this book
      const existingController = pendingRequests.current.get(`favorite-${bookId}`);
      if (existingController) {
        existingController.abort();
      }

      const controller = new AbortController();
      pendingRequests.current.set(`favorite-${bookId}`, controller);

      try {
        await apiFetch(
          "POST",
          "/api/books/setBookToFavorite",
          { bookId, isFavorite },
          undefined,
          { signal: controller.signal }
        );
        callbacks?.onFavoriteChange?.(bookId, isFavorite);
      } catch (error) {
        if (error instanceof Error && error.name !== "AbortError") {
          callbacks?.onError?.(error);
          throw error;
        }
      } finally {
        pendingRequests.current.delete(`favorite-${bookId}`);
      }
    },
    [callbacks]
  );

  const updateLastAccessed = useCallback(async (bookId: string) => {
    try {
      await apiFetch("POST", "/api/books/updateLastAccessed", { bookId });
    } catch (error) {
      // Silent fail - not critical
      console.error("Failed to update last accessed:", error);
    }
  }, []);

  const updateSpentTime = useCallback(
    async (bookId: string, additionalHours: number) => {
      try {
        await apiFetch("POST", "/api/books/updateSpentTime", {
          bookId,
          amount: additionalHours,
        });
      } catch (error) {
        // Silent fail - not critical, will sync on next save
        console.error("Failed to update spent time:", error);
      }
    },
    []
  );

  const deleteBook = useCallback(
    async (bookId: string, onSuccess?: () => void) => {
      try {
        await apiFetch("DELETE", "/api/books/[id]", undefined, { id: bookId });
        callbacks?.onDeleteSuccess?.(bookId);
        onSuccess?.();
      } catch (error) {
        if (error instanceof Error) {
          callbacks?.onError?.(error);
        }
        throw error;
      }
    },
    [callbacks]
  );

  return {
    setFavorite,
    updateLastAccessed,
    updateSpentTime,
    deleteBook,
  };
}
