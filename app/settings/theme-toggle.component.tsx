"use client";

import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Laptop, Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();

  const current =
    theme && theme === "system"
      ? `System (${resolvedTheme ?? ""})`
      : theme?.[0]!.toUpperCase() + theme!.slice(1);

  return (
    <div className="flex items-center gap-3">
      <Preview />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="min-w-[160px] justify-between">
            <span className="flex items-center gap-2">
              {resolvedTheme === "dark" ? (
                <Moon className="h-4 w-4" />
              ) : (
                <Sun className="h-4 w-4" />
              )}
              {current ?? "Theme"}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[180px]">
          <DropdownMenuItem onClick={() => setTheme("light")}>
            <Sun className="mr-2 h-4 w-4" /> Light
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme("dark")}>
            <Moon className="mr-2 h-4 w-4" /> Dark
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme("system")}>
            <Laptop className="mr-2 h-4 w-4" /> System
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function Preview() {
  return (
    <div className="grid grid-cols-3 gap-2 rounded-xl border p-3">
      <div className="h-8 w-16 rounded-md bg-background shadow-sm ring-1 ring-border" />
      <div className="h-8 w-16 rounded-md bg-primary/80" />
      <div className="h-8 w-16 rounded-md bg-muted" />
      <div className="col-span-3 h-8 rounded-md border bg-card" />
    </div>
  );
}
