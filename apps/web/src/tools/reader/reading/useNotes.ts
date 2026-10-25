import { useState, useCallback, useRef, useEffect } from "react";
import { readerApi } from "@tools/reader/api";
import type { NoteResponse, CreateNoteDto, UpdateNoteDto } from "@tools/reader/types";

type UseNotesOptions = {
  bookId: string;
  initialNotes?: NoteResponse[];
};

/**
 * Hook for managing notes with CRUD operations and optimistic updates.
 */
export function useNotes({ bookId, initialNotes = [] }: UseNotesOptions) {
  const [notes, setNotes] = useState<NoteResponse[]>(initialNotes);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  // Fetch notes from server on mount
  useEffect(() => {
    if (fetchedRef.current || !bookId) return;
    fetchedRef.current = true;

    async function fetchNotes() {
      setIsLoading(true);
      try {
        const notesList = await readerApi.reading.listNotes(bookId);
        setNotes(notesList);
      } catch (err) {
        console.error("Failed to fetch notes:", err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchNotes();
  }, [bookId]);

  const createNote = useCallback(
    async (dto: CreateNoteDto): Promise<NoteResponse | null> => {
      setError(null);
      try {
        const newNote = await readerApi.reading.createNote(bookId, dto);
        setNotes((prev) => [newNote, ...prev]);
        return newNote;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create note";
        setError(message);
        console.error("Failed to create note:", err);
        return null;
      }
    },
    [bookId]
  );

  const updateNote = useCallback(
    async (noteId: string, dto: UpdateNoteDto): Promise<boolean> => {
      setError(null);

      // Optimistic update
      const previousNotes = [...notes];
      setNotes((prev) =>
        prev.map((n) =>
          n.id === noteId ? { ...n, ...dto, updatedAt: new Date().toISOString() } : n
        )
      );

      try {
        await readerApi.reading.updateNote(noteId, dto);
        return true;
      } catch (err) {
        // Rollback on error
        setNotes(previousNotes);
        const message = err instanceof Error ? err.message : "Failed to update note";
        setError(message);
        console.error("Failed to update note:", err);
        return false;
      }
    },
    [notes]
  );

  const deleteNote = useCallback(
    async (noteId: string): Promise<boolean> => {
      setError(null);

      // Optimistic update
      const previousNotes = [...notes];
      setNotes((prev) => prev.filter((n) => n.id !== noteId));

      try {
        await readerApi.reading.deleteNote(noteId);
        return true;
      } catch (err) {
        // Rollback on error
        setNotes(previousNotes);
        const message = err instanceof Error ? err.message : "Failed to delete note";
        setError(message);
        console.error("Failed to delete note:", err);
        return false;
      }
    },
    [notes]
  );

  const togglePin = useCallback(
    async (noteId: string): Promise<boolean> => {
      const note = notes.find((n) => n.id === noteId);
      if (!note) return false;
      return updateNote(noteId, { isPinned: !note.isPinned });
    },
    [notes, updateNote]
  );

  const refreshNotes = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const notesList = await readerApi.reading.listNotes(bookId);
      setNotes(notesList);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch notes";
      setError(message);
      console.error("Failed to fetch notes:", err);
    } finally {
      setIsLoading(false);
    }
  }, [bookId]);

  return {
    notes,
    isLoading,
    error,
    createNote,
    updateNote,
    deleteNote,
    togglePin,
    refreshNotes,
  };
}
