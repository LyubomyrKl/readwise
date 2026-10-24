"use client";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 h-screen w-screen overflow-hidden">
      {children}
    </div>
  );
}
