"use client";
import React from "react";
import { useRouter } from "next/navigation";
import { Library, Brain, BookMarked } from "lucide-react";
import { ROUTES } from "./(consts)/routes";

export default function Home() {
  const router = useRouter();

  const navItems = [
    { href: ROUTES.reader.library, label: "Reader", icon: <Library /> },
    { href: ROUTES.learning.dashboard, label: "Language Trainer", icon: <Brain /> },
    { href: ROUTES.dictionary.list, label: "Dictionary", icon: <BookMarked /> },
  ];

  // Navigate using Next.js router
  const handleNavClick = (href: string) => {
    router.push(href);
  };

  return (
    <div className="min-h-screen flex flex-col sm:flex-row font-sans">
      {/* Sidebar for desktop */}
      <aside className="hidden sm:flex flex-col w-48 bg-gray-100 dark:bg-gray-800 p-6 gap-4">
        {navItems.map((item) => (
          <button
            key={item.href}
            onClick={() => handleNavClick(item.href)}
            className="flex items-center gap-3 p-3 rounded-lg bg-foreground text-background hover:bg-[#383838] dark:hover:bg-[#ccc] transition-colors font-medium"
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 gap-6 sm:gap-10">
        <h1 className="text-2xl sm:text-3xl font-bold">Welcome!</h1>

        {/* Mobile nav */}
        <div className="flex sm:hidden gap-4">
          {navItems.map((item) => (
            <button
              key={item.href}
              onClick={() => handleNavClick(item.href)}
              className="flex items-center gap-2 p-3 rounded-full bg-foreground text-background hover:bg-[#383838] dark:hover:bg-[#ccc] transition-colors"
            >
              {item.icon}
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
