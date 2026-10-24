"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { PLATFORM_ROUTES } from "@platform/routes";
import {
  AppMobileSidebar,
  AppSidebar,
  MobileSidebarProvider,
  MobileSidebarTrigger,
} from "./AppSidebar";
import { TOOLS, findToolByPath } from "./registry";
import { settingsNav } from "./settings";
import { toolBasePath, type NavItem } from "./ToolManifest";

function dashboardNav(): NavItem[] {
  return TOOLS.map((tool) => ({
    title: tool.name,
    icon: tool.icon,
    href: toolBasePath(tool.id),
  }));
}

/**
 * Sidebar and app switcher for every page except auth and full-screen
 * surfaces. Navigation comes from the current tool's manifest; on /settings
 * it lists the settings sections, on the dashboard the tools.
 */
export function ShellLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? PLATFORM_ROUTES.home;
  const tool = findToolByPath(pathname);
  const inSettings =
    pathname === PLATFORM_ROUTES.settings.root ||
    pathname.startsWith(`${PLATFORM_ROUTES.settings.root}/`);
  const nav = tool ? tool.nav : inSettings ? settingsNav() : dashboardNav();

  return (
    <MobileSidebarProvider>
      <div className="flex min-h-dvh">
        <AppSidebar
          nav={nav}
          actionButton={tool?.actionButton}
          showSettings={!inSettings}
        />
        <AppMobileSidebar
          nav={nav}
          actionButton={tool?.actionButton}
          showSettings={!inSettings}
        />
        <main className="flex-1 min-h-dvh min-w-0 overflow-y-auto relative">
          <div className="fixed top-3 right-3 z-30 md:hidden">
            <MobileSidebarTrigger className="bg-background/80 backdrop-blur-sm shadow-md border" />
          </div>
          {children}
        </main>
      </div>
    </MobileSidebarProvider>
  );
}
