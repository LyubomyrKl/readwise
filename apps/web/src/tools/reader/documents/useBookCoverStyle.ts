"use client";

import { useCallback, useSyncExternalStore } from "react";

export type BookCoverStyle = "classic" | "modern";

const STORAGE_KEY = "bookCoverBackgroundStyle";
const listeners = new Set<() => void>();

function read(): BookCoverStyle {
  if (typeof window === "undefined") return "classic";
  return window.localStorage.getItem(STORAGE_KEY) === "modern" ? "modern" : "classic";
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) callback();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Cover rendering preference, persisted in localStorage. No provider needed,
 * so the library cards and the settings page can share it from anywhere.
 */
export function useBookCoverStyle() {
  const backgroundStyle = useSyncExternalStore(subscribe, read, () => "classic" as BookCoverStyle);
  const setBackgroundStyle = useCallback((style: BookCoverStyle) => {
    window.localStorage.setItem(STORAGE_KEY, style);
    listeners.forEach((listener) => listener());
  }, []);
  return { backgroundStyle, setBackgroundStyle };
}
