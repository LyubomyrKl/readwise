import { useState, useCallback, useRef } from "react";
import { apiFetch } from "@/lib/fetcher";
import type {
  HighlightResponse,
  CreateHighlightDto,
  UpdateHighlightDto,
} from "@/lib/types";

type UseHighlightsOptions = {
  bookId: string;
  initialHighlights?: HighlightResponse[];
};

/**
 * Hook for managing highlights with CRUD operations and optimistic updates.
 */
export function useHighlights({
  bookId,
  initialHighlights = [],
}: UseHighlightsOptions) {
  // Use a ref to track if we've initialized from props
  const initializedRef = useRef(false);
  const [highlights, setHighlights] = useState<HighlightResponse[]>(() => {
    initializedRef.current = true;
    return initialHighlights;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createHighlight = useCallback(
    async (dto: CreateHighlightDto): Promise<HighlightResponse | null> => {
      setError(null);
      try {
        const newHighlight = await apiFetch(
          "POST",
          "/api/books/[id]/highlights",
          dto,
          { id: bookId }
        );
        setHighlights((prev) => [...prev, newHighlight]);
        return newHighlight;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create highlight";
        setError(message);
        console.error("Failed to create highlight:", err);
        return null;
      }
    },
    [bookId]
  );

  const updateHighlight = useCallback(
    async (highlightId: string, dto: UpdateHighlightDto): Promise<boolean> => {
      setError(null);

      // Optimistic update
      const previousHighlights = [...highlights];
      setHighlights((prev) =>
        prev.map((h) =>
          h.id === highlightId ? { ...h, ...dto, updatedAt: new Date().toISOString() } : h
        )
      );

      try {
        await apiFetch("PATCH", "/api/highlights/[id]", dto, { id: highlightId });
        return true;
      } catch (err) {
        // Rollback on error
        setHighlights(previousHighlights);
        const message = err instanceof Error ? err.message : "Failed to update highlight";
        setError(message);
        console.error("Failed to update highlight:", err);
        return false;
      }
    },
    [highlights]
  );

  const deleteHighlight = useCallback(
    async (highlightId: string): Promise<boolean> => {
      setError(null);

      // Optimistic update
      const previousHighlights = [...highlights];
      setHighlights((prev) => prev.filter((h) => h.id !== highlightId));

      try {
        await apiFetch("DELETE", "/api/highlights/[id]", undefined, { id: highlightId });
        return true;
      } catch (err) {
        // Rollback on error
        setHighlights(previousHighlights);
        const message = err instanceof Error ? err.message : "Failed to delete highlight";
        setError(message);
        console.error("Failed to delete highlight:", err);
        return false;
      }
    },
    [highlights]
  );

  const refreshHighlights = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const highlightsList = await apiFetch("GET", "/api/books/[id]/highlights", undefined, {
        id: bookId,
      });
      setHighlights(highlightsList);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch highlights";
      setError(message);
      console.error("Failed to fetch highlights:", err);
    } finally {
      setIsLoading(false);
    }
  }, [bookId]);

  return {
    highlights,
    isLoading,
    error,
    createHighlight,
    updateHighlight,
    deleteHighlight,
    refreshHighlights,
  };
}
