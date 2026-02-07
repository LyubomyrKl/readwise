"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { BookOpen, Brain, BarChart3, Settings, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppSwitcher } from "@/components/AppSwitcher";

const navItems = [
  { href: "/learning/study", label: "Study", icon: Brain },
  { href: "/learning/notes", label: "Notes", icon: BookOpen },
  { href: "/learning/stats", label: "Statistics", icon: BarChart3 },
  { href: "/learning/settings", label: "Settings", icon: Settings },
];

export default function LearningLayout({
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
          <AppSwitcher />
        </div>

        <nav className="space-y-1 flex-1">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
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
          <Link href="/learning/notes/new">
            <Button className="w-full" variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              Add Note
            </Button>
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
