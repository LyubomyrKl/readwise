"use client";

import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar, NavItem } from "@/app/(components)/AppSidebar";
import { Settings, Palette, BookOpen, User, Brain } from "lucide-react";
import { useRef, useEffect } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { ROUTES } from "@/app/(consts)/routes";

const nav: NavItem[] = [
  { title: "General", icon: Settings, href: ROUTES.settings.root },
  { title: "Appearance", icon: Palette, href: ROUTES.settings.appearance },
  { title: "Reader", icon: BookOpen, href: ROUTES.settings.reader },
  { title: "Learning", icon: Brain, href: ROUTES.settings.learning },
  { title: "Account", icon: User, href: ROUTES.settings.account },
];

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
        <AppSidebar nav={nav} showSettings={false} />
      </div>
      <main className="flex-1 min-h-dvh min-w-0 w-full overflow-y-auto relative">
        {/* Mobile sidebar trigger */}
        {isMobile && (
          <div className="fixed top-3 left-3 z-50 md:hidden">
            <SidebarTrigger className="bg-background/80 backdrop-blur-sm shadow-md border" />
          </div>
        )}
        <div className="p-4 md:p-6 max-w-4xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}

export default function SettingsLayout({
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
