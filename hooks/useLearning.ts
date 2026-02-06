"use client";

import { useCallback, useState, useRef, useEffect } from "react";
import { apiFetch } from "@/lib/fetcher";
import type {
  LearningNoteResponse,
  LearningCardResponse,
  StudyQueueResponse,
  StatsResponse,
  SettingsResponse,
  CreateLearningNoteDto,
  UpdateLearningNoteDto,
  ValidateNoteDto,
  ValidationResultResponse,
  SubmitReviewDto,
  ReviewResultResponse,
  ReviewRating,
} from "@/lib/types";

// Hook for managing learning notes
export function useLearningNotes() {
  const [notes, setNotes] = useState<LearningNoteResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  const fetchNotes = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiFetch("GET", "/api/learning/notes");
      setNotes(data);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch notes";
      setError(message);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createNote = useCallback(async (dto: CreateLearningNoteDto) => {
    try {
      const newNote = await apiFetch("POST", "/api/learning/notes", dto);
      setNotes((prev) => [newNote, ...prev]);
      return newNote;
    } catch (err) {
      throw err;
    }
  }, []);

  const updateNote = useCallback(
    async (id: string, dto: UpdateLearningNoteDto) => {
      try {
        const updated = await apiFetch(
          "PATCH",
          "/api/learning/notes/[id]",
          dto,
          { id }
        );
        setNotes((prev) => prev.map((n) => (n.id === id ? updated : n)));
        return updated;
      } catch (err) {
        throw err;
      }
    },
    []
  );

  const deleteNote = useCallback(async (id: string) => {
    try {
      await apiFetch("DELETE", "/api/learning/notes/[id]", undefined, { id });
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      throw err;
    }
  }, []);

  const validateNote = useCallback(
    async (dto: ValidateNoteDto): Promise<ValidationResultResponse> => {
      return apiFetch("POST", "/api/learning/notes/validate", dto);
    },
    []
  );

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetchNotes();
  }, [fetchNotes]);

  return {
    notes,
    isLoading,
    error,
    fetchNotes,
    createNote,
    updateNote,
    deleteNote,
    validateNote,
  };
}

// Hook for study queue
export function useStudyQueue() {
  const [queue, setQueue] = useState<StudyQueueResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  const fetchQueue = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiFetch("GET", "/api/learning/study/queue");
      setQueue(data);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch queue";
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetchQueue();
  }, [fetchQueue]);

  return { queue, isLoading, error, refetch: fetchQueue };
}

// Hook for study session
export function useStudySession() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [isActive, setIsActive] = useState(false);

  const startSession = useCallback(async () => {
    try {
      const result = await apiFetch(
        "POST",
        "/api/learning/study/session/start",
        {}
      );
      setSessionId(result.sessionId);
      setStartTime(Date.now());
      setIsActive(true);
      return result;
    } catch (err) {
      throw err;
    }
  }, []);

  const endSession = useCallback(async () => {
    if (!sessionId || !startTime) return;

    try {
      await apiFetch("POST", "/api/learning/study/session/end", {
        sessionId,
        totalTimeMs: Date.now() - startTime,
      });
      setSessionId(null);
      setStartTime(null);
      setIsActive(false);
    } catch (err) {
      throw err;
    }
  }, [sessionId, startTime]);

  return {
    sessionId,
    isActive,
    startSession,
    endSession,
    elapsedMs: startTime ? Date.now() - startTime : 0,
  };
}

// Hook for submitting reviews
export function useReview() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitReview = useCallback(
    async (dto: SubmitReviewDto): Promise<ReviewResultResponse> => {
      setIsSubmitting(true);
      try {
        const result = await apiFetch("POST", "/api/learning/study/review", dto);
        return result;
      } finally {
        setIsSubmitting(false);
      }
    },
    []
  );

  return { submitReview, isSubmitting };
}

// Hook for learning statistics
export function useLearningStats() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const fetchedRef = useRef(false);

  const fetchStats = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiFetch("GET", "/api/learning/stats");
      setStats(data);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetchStats();
  }, [fetchStats]);

  return { stats, isLoading, refetch: fetchStats };
}

// Hook for learning settings
export function useLearningSettings() {
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const fetchedRef = useRef(false);

  const fetchSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiFetch("GET", "/api/learning/settings");
      setSettings(data);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateSettings = useCallback(
    async (updates: Partial<SettingsResponse>) => {
      try {
        const updated = await apiFetch(
          "PATCH",
          "/api/learning/settings",
          updates
        );
        setSettings(updated);
        return updated;
      } catch (err) {
        throw err;
      }
    },
    []
  );

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetchSettings();
  }, [fetchSettings]);

  return { settings, isLoading, updateSettings, refetch: fetchSettings };
}

// Hook for debouncing values
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
