"use client";

import type { ReactNode } from "react";
import { UploadProvider } from "./documents/upload/UploadProvider";
import { UploadWidget } from "./documents/upload/UploadWidget";

/** Tool-scoped providers and chrome: the upload queue follows the user around the reader only. */
export function ReaderToolLayout({ children }: { children: ReactNode }) {
  return (
    <UploadProvider>
      {children}
      <UploadWidget />
    </UploadProvider>
  );
}
