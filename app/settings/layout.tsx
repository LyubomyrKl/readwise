import type { Metadata } from "next";
import Header from "./header";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto min-h-svh w-full max-w-[1000px] px-4 py-8">
      <Header />
      <main className="mt-6">{children}</main>
    </div>
  );
}
