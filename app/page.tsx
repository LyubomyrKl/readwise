"use client";
import React from "react";
import { Library, Brain, BookMarked } from "lucide-react";
import Link from "next/link";
import { ROUTES } from "./(consts)/routes";

export default function Home() {
  return (
    <div className="font-sans grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-4 pb-16 gap-8 sm:p-8 sm:pb-20 sm:gap-16 md:p-20">
      <main className="flex flex-col sm:flex-row sm:justify-center gap-6 sm:gap-[32px] row-start-2 items-center sm:items-start w-full max-w-sm sm:max-w-none">
        <Link
          href={ROUTES.reader.library}
          className="rounded-full border border-solid border-transparent transition-colors flex items-center justify-center bg-foreground text-background gap-2 hover:bg-[#383838] dark:hover:bg-[#ccc] font-medium text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-5 w-full sm:w-auto"
        >
          <Library />
          Reader
        </Link>
        <Link
          href={ROUTES.learning.dashboard}
          className="rounded-full border border-solid border-transparent transition-colors flex items-center justify-center bg-foreground text-background gap-2 hover:bg-[#383838] dark:hover:bg-[#ccc] font-medium text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-5 w-full sm:w-auto"
        >
          <Brain />
          Language Trainer
        </Link>

        <Link
          href={ROUTES.dictionary.list}
          className="rounded-full border border-solid border-transparent transition-colors flex items-center justify-center bg-foreground text-background gap-2 hover:bg-[#383838] dark:hover:bg-[#ccc] font-medium text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-5 w-full sm:w-auto"
        >
          <BookMarked />
          Dictionary
        </Link>
      </main>
    </div>
  );
}
