"use client";

import { ThemeProvider } from "next-themes";
import { MotionProvider } from "./MotionProvider";
import { UploadProvider } from "./UploadProvider";
import { BookCoverProvider } from "./BookCoverProvider/BookCoverProvider";
import { NavigationCleanup } from "./NavigationCleanup";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      enableSystem={false}
      disableTransitionOnChange
    >
      <MotionProvider>
        <UploadProvider>
          <BookCoverProvider>
            <NavigationCleanup />
            {children}
          </BookCoverProvider>
        </UploadProvider>
      </MotionProvider>
    </ThemeProvider>
  );
}
