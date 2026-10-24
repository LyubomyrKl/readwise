"use client";

import {
  AppSidebar,
  AppMobileSidebar,
  MobileSidebarProvider,
  MobileSidebarTrigger,
  NavItem,
} from "@/app/(components)/AppSidebar";
import { Settings, Palette, BookOpen, User } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { ROUTES } from "@/app/(consts)/routes";

const nav: NavItem[] = [
  { title: "General", icon: Settings, href: ROUTES.settings.root },
  { title: "Appearance", icon: Palette, href: ROUTES.settings.appearance },
  { title: "Reader", icon: BookOpen, href: ROUTES.settings.reader },
  { title: "Account", icon: User, href: ROUTES.settings.account },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isMobile = useIsMobile();

  return (
    <MobileSidebarProvider>
      <div className="flex min-h-dvh">
        <AppSidebar nav={nav} showSettings={false} />
        <AppMobileSidebar nav={nav} showSettings={false} />
        <main className="flex-1 min-h-dvh min-w-0 w-full overflow-y-auto relative">
          {isMobile && (
            <div className="fixed top-3 right-3 z-30 md:hidden">
              <MobileSidebarTrigger className="bg-background/80 backdrop-blur-sm shadow-md border" />
            </div>
          )}
          <div className="p-4 md:p-6 max-w-4xl mx-auto">{children}</div>
        </main>
      </div>
    </MobileSidebarProvider>
  );
}
