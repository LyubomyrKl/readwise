import type { ReactNode } from "react";
import { ReaderToolLayout } from "@tools/reader/ReaderToolLayout";

export default function Layout({ children }: { children: ReactNode }) {
  return <ReaderToolLayout>{children}</ReaderToolLayout>;
}
