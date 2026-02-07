"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { BookOpen, Plus, BarChart3, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/dictionary", label: "All Words", icon: BookOpen },
];

export default function DictionaryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-muted/30 p-4 flex flex-col">
        <div className="mb-6">
          <Link href="/dictionary" className="flex items-center gap-2">
            <BookOpen className="h-6 w-6" />
            <span className="font-semibold text-lg">Dictionary</span>
          </Link>
        </div>

        <nav className="space-y-1 flex-1">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dictionary" && pathname.startsWith(item.href + "/"));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="pt-4 border-t">
          <Link href="/dictionary/new">
            <Button className="w-full" variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              Add Word
            </Button>
          </Link>
        </div>

        <div className="pt-4 space-y-2">
          <Link href="/learning/study">
            <Button variant="ghost" className="w-full justify-start text-muted-foreground">
              <Brain className="h-4 w-4 mr-2" />
              Language Trainer
            </Button>
          </Link>
          <Link href="/reader/library">
            <Button variant="ghost" className="w-full justify-start text-muted-foreground">
              Back to Reader
            </Button>
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
