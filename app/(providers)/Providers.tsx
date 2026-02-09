"use client";

import { ThemeProvider } from "next-themes";
import { MotionProvider } from "./MotionProvider";
import { UploadProvider } from "./UploadProvider";
import { BookCoverProvider } from "./BookCoverProvider/BookCoverProvider";
import { SidebarProvider } from "@/components/ui/sidebar";

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
            <SidebarProvider defaultOpen={true}>
              {children}
            </SidebarProvider>
          </BookCoverProvider>
        </UploadProvider>
      </MotionProvider>
    </ThemeProvider>
  );
}
