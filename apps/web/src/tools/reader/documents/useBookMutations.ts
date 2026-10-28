import { useCallback, useRef } from "react";
import { readerApi } from "@tools/reader/api";
import { useInvalidateReader } from "@tools/reader/queries";

type BookMutationCallbacks = {
  onFavoriteChange?: (bookId: string, isFavorite: boolean) => void;
  onDeleteSuccess?: (bookId: string) => void;
  onError?: (error: Error) => void;
};

/**
 * Book mutations with optimistic updates and error handling: favorite, time
 * tracking, last accessed, delete.
 */
export function useBookMutations(callbacks?: BookMutationCallbacks) {
  const pendingRequests = useRef<Map<string, AbortController>>(new Map());
  const invalidate = useInvalidateReader();

  const setFavorite = useCallback(
    async (bookId: string, isFavorite: boolean) => {
      // a newer toggle for the same book wins
      pendingRequests.current.get(`favorite-${bookId}`)?.abort();
      const controller = new AbortController();
      pendingRequests.current.set(`favorite-${bookId}`, controller);

      try {
        await readerApi.documents.setFavorite(bookId, isFavorite, controller.signal);
        callbacks?.onFavoriteChange?.(bookId, isFavorite);
        void invalidate(bookId);
      } catch (error) {
        if (error instanceof Error && error.name !== "AbortError") {
          callbacks?.onError?.(error);
          throw error;
        }
      } finally {
        pendingRequests.current.delete(`favorite-${bookId}`);
      }
    },
    [callbacks, invalidate]
  );

  const updateLastAccessed = useCallback(async (bookId: string) => {
    try {
      await readerApi.documents.setLastAccessed(bookId);
    } catch (error) {
      // not critical
      console.error("Failed to update last accessed:", error);
    }
  }, []);

  const updateSpentTime = useCallback(async (bookId: string, additionalHours: number) => {
    try {
      await readerApi.documents.addSpentTime(bookId, additionalHours);
    } catch (error) {
      // not critical, the next save catches up
      console.error("Failed to update spent time:", error);
    }
  }, []);

  const deleteBook = useCallback(
    async (bookId: string, onSuccess?: () => void) => {
      try {
        await readerApi.documents.delete(bookId);
        callbacks?.onDeleteSuccess?.(bookId);
        void invalidate();
        onSuccess?.();
      } catch (error) {
        if (error instanceof Error) {
          callbacks?.onError?.(error);
        }
        throw error;
      }
    },
    [callbacks, invalidate]
  );

  return { setFavorite, updateLastAccessed, updateSpentTime, deleteBook };
}
