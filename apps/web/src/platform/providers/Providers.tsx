"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "next-themes";
import { MotionProvider } from "./MotionProvider";
import { OfflineProvider } from "./OfflineProvider";
import { QueryProvider } from "./QueryProvider";

/** Global providers. Tool-scoped state (uploads, cover style) lives inside the tools. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" enableSystem={false} disableTransitionOnChange>
      <QueryProvider>
        <OfflineProvider>
          <MotionProvider>{children}</MotionProvider>
        </OfflineProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}
