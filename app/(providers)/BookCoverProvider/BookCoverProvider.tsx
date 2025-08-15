"use client";

import { createContext, useContext, useEffect, useState } from "react";

type BookCoverStyle = "classic" | "modern";

interface BookCoverContextType {
  backgroundStyle: BookCoverStyle;
  setBackgroundStyle: (style: BookCoverStyle) => void;
}

const BookCoverContext = createContext<BookCoverContextType | undefined>(
  undefined
);

export function BookCoverProvider({ children }: { children: React.ReactNode }) {
  const [backgroundStyle, setBackgroundStyleState] =
    useState<BookCoverStyle>("classic");

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(
      "bookCoverBackgroundStyle"
    ) as BookCoverStyle;

    if (saved && (saved === "classic" || saved === "modern")) {
      setBackgroundStyleState(saved);
    }
  }, []);

  // Save to localStorage when changed
  const setBackgroundStyle = (style: BookCoverStyle) => {
    setBackgroundStyleState(style);
    localStorage.setItem("bookCoverBackgroundStyle", style);
  };

  return (
    <BookCoverContext.Provider value={{ backgroundStyle, setBackgroundStyle }}>
      {children}
    </BookCoverContext.Provider>
  );
}

export function useBookCover() {
  const context = useContext(BookCoverContext);
  if (context === undefined) {
    throw new Error("useBookCover must be used within a BookCoverProvider");
  }
  return context;
}
