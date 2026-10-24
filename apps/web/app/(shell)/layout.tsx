import type { ReactNode } from "react";
import { ShellLayout } from "@platform/shell/ShellLayout";

export default function Layout({ children }: { children: ReactNode }) {
  return <ShellLayout>{children}</ShellLayout>;
}
