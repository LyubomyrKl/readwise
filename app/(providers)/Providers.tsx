"use client";

import { ThemeProvider } from "next-themes";
import { MotionProvider } from "./MotionProvider";
import { UploadProvider } from "./UploadProvider";
import { BookCoverProvider } from "./BookCoverProvider/BookCoverProvider";
import { OfflineProvider } from "./OfflineProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      enableSystem={false}
      disableTransitionOnChange
    >
      <OfflineProvider>
        <MotionProvider>
          <UploadProvider>
            <BookCoverProvider>
              {children}
            </BookCoverProvider>
          </UploadProvider>
        </MotionProvider>
      </OfflineProvider>
    </ThemeProvider>
  );
}
