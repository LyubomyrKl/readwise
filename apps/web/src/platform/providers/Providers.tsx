"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "next-themes";
import { MotionProvider } from "./MotionProvider";
import { OfflineProvider } from "./OfflineProvider";

/** Global providers. Tool-scoped state (uploads, cover style) lives inside the tools. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" enableSystem={false} disableTransitionOnChange>
      <OfflineProvider>
        <MotionProvider>{children}</MotionProvider>
      </OfflineProvider>
    </ThemeProvider>
  );
}
