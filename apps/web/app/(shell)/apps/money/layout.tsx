import type { ReactNode } from "react";
import { QuickEntryProvider } from "@tools/money/components/QuickEntry";

/** Every money page logs a movement without leaving it: the + button, the N key, a New button. */
export default function MoneyLayout({ children }: { children: ReactNode }) {
  return <QuickEntryProvider>{children}</QuickEntryProvider>;
}
