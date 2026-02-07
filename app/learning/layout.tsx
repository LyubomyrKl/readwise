"use client";

import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar, NavItem, ActionButton } from "@/app/(components)/AppSidebar";
import { Brain, BookOpen, BarChart3, Plus } from "lucide-react";
import { useRef, useEffect } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { ROUTES } from "@/app/(consts)/routes";

const nav: NavItem[] = [
  { title: "Study", icon: Brain, href: ROUTES.learning.study },
  { title: "Notes", icon: BookOpen, href: ROUTES.learning.notes },
  { title: "Statistics", icon: BarChart3, href: ROUTES.learning.stats },
];

const actionButton: ActionButton = {
  title: "Add Note",
  href: ROUTES.learning.notesNew,
  icon: Plus,
};

function LayoutInner({ children }: { children: React.ReactNode }) {
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
        {/* Mobile sidebar trigger */}
        {isMobile && (
          <div className="fixed top-3 left-3 z-50 md:hidden">
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

export default function LearningLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider defaultOpen={true}>
      <LayoutInner>{children}</LayoutInner>
    </SidebarProvider>
  );
}
