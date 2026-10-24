import type { ReactNode } from "react";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-4xl p-4 md:p-6">{children}</div>;
}
