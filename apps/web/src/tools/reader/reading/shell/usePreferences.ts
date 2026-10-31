"use client";

import { useCallback, useState } from "react";
import { DEFAULT_PREFERENCES, type ReaderPreferences } from "../engines/types";

const KEY = "reader.preferences.v2";

function load(): ReaderPreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<ReaderPreferences> | null;
    return { ...DEFAULT_PREFERENCES, ...(stored ?? {}) };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

/** Reading preferences of this device (theme, type size, line height, flow, PDF zoom). */
export function usePreferences(): [ReaderPreferences, (patch: Partial<ReaderPreferences>) => void] {
  const [preferences, setPreferences] = useState<ReaderPreferences>(load);
  const update = useCallback((patch: Partial<ReaderPreferences>) => {
    setPreferences((current) => {
      const next = { ...current, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* private mode: preferences last for this visit */
      }
      return next;
    });
  }, []);
  return [preferences, update];
}
