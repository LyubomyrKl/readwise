"use client";

import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar, NavItem, ActionButton } from "@/app/(components)/AppSidebar";
import { BookOpen, Plus } from "lucide-react";
import { useRef, useEffect } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { ROUTES } from "@/app/(consts)/routes";

const nav: NavItem[] = [
  { title: "All Words", icon: BookOpen, href: ROUTES.dictionary.list },
];

const actionButton: ActionButton = {
  title: "Add Word",
  href: ROUTES.dictionary.new,
  icon: Plus,
};

export default function DictionaryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { setOpen, open } = useSidebar();
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (!open) return;
      if (
        sidebarRef.current &&
        !sidebarRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, setOpen]);

  return (
    <div className="flex grow min-h-dvh">
      <div ref={sidebarRef}>
        <AppSidebar nav={nav} actionButton={actionButton} />
      </div>
      <main className="flex-1 min-h-dvh min-w-0 w-full overflow-y-auto relative">
        {isMobile && (
          <div className="fixed top-3 right-3 z-50 md:hidden">
            <SidebarTrigger className="bg-background/80 backdrop-blur-sm shadow-md border" />
          </div>
        )}
        <div className="p-4 md:p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
