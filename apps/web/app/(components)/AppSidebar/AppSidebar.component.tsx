"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Settings, ChevronRight, Plus } from "lucide-react";
import { AppSwitcher } from "@/components/AppSwitcher";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  MobileSidebarProvider,
  MobileSidebarTrigger,
  MobileSidebarContent,
  useMobileSidebar,
} from "@/components/MobileSidebar";

export type SubItem = { title: string; href: string };

export type NavItem =
  | { title: string; icon: React.ElementType; href: string }
  | {
      title: string;
      icon: React.ElementType;
      items: SubItem[];
      defaultOpen?: boolean;
    };

export type ActionButton = {
  title: string;
  href: string;
  icon?: React.ElementType;
};

function NavLink({
  href,
  children,
  isActive,
  onClick,
}: {
  href: string;
  children: React.ReactNode;
  isActive: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        isActive && "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
      )}
    >
      {children}
    </Link>
  );
}

function SidebarNav({
  nav,
  actionButton,
  showSettings,
  expanded,
  onNavigate,
}: {
  nav: NavItem[];
  actionButton?: ActionButton;
  showSettings: boolean;
  expanded: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  const isActiveLink = (href: string) => {
    const isExactMatch = pathname === href;
    const isChildMatch = href !== "/" && pathname?.startsWith(href + "/");
    return isExactMatch || isChildMatch;
  };

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      {/* Header */}
      <div className="p-2">
        <AppSwitcher showLabel={expanded} onNavigate={onNavigate} />
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto p-2">
        <nav className="flex flex-col gap-1">
          {nav.map((entry, i) => {
            if ("href" in entry) {
              const Icon = entry.icon;
              return (
                <NavLink
                  key={i}
                  href={entry.href}
                  isActive={isActiveLink(entry.href)}
                  onClick={onNavigate}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {expanded && <span>{entry.title}</span>}
                </NavLink>
              );
            }

            const Icon = entry.icon;
            return (
              <Collapsible
                key={i}
                defaultOpen={entry.defaultOpen}
                className="group/collapsible"
              >
                <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
                  <Icon className="h-4 w-4 shrink-0" />
                  {expanded && (
                    <>
                      <span className="flex-1 text-left">{entry.title}</span>
                      <ChevronRight className="h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-90" />
                    </>
                  )}
                </CollapsibleTrigger>
                {expanded && (
                  <CollapsibleContent>
                    <div className="ml-4 mt-1 flex flex-col gap-1 border-l border-sidebar-border pl-2">
                      {entry.items.map((item) => (
                        <NavLink
                          key={item.href}
                          href={item.href}
                          isActive={isActiveLink(item.href)}
                          onClick={onNavigate}
                        >
                          <span>{item.title}</span>
                        </NavLink>
                      ))}
                    </div>
                  </CollapsibleContent>
                )}
              </Collapsible>
            );
          })}
        </nav>

        {actionButton && expanded && (
          <div className="mt-4">
            <Link href={actionButton.href} onClick={onNavigate}>
              <Button className="w-full" variant="outline" size="sm">
                {actionButton.icon ? (
                  <actionButton.icon className="h-4 w-4 mr-2" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                {actionButton.title}
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* Footer */}
      {showSettings && (
        <div className="border-t border-sidebar-border p-2">
          <NavLink
            href="/settings"
            isActive={isActiveLink("/settings")}
            onClick={onNavigate}
          >
            <Settings className="h-4 w-4 shrink-0" />
            {expanded && <span>Settings</span>}
          </NavLink>
        </div>
      )}
    </div>
  );
}

function DesktopSidebar({
  nav,
  actionButton,
  showSettings,
}: {
  nav: NavItem[];
  actionButton?: ActionButton;
  showSettings: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!expanded) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [expanded]);

  return (
    <aside
      ref={sidebarRef}
      onClick={() => !expanded && setExpanded(true)}
      className={cn(
        "hidden md:flex h-dvh sticky top-0 shrink-0 flex-col border-r border-sidebar-border transition-all duration-200",
        expanded ? "w-64" : "w-12 cursor-pointer hover:bg-sidebar-accent/50"
      )}
    >
      <SidebarNav
        nav={nav}
        actionButton={actionButton}
        showSettings={showSettings}
        expanded={expanded}
      />
    </aside>
  );
}

function MobileSidebarNav({
  nav,
  actionButton,
  showSettings,
}: {
  nav: NavItem[];
  actionButton?: ActionButton;
  showSettings: boolean;
}) {
  const { close } = useMobileSidebar();

  return (
    <SidebarNav
      nav={nav}
      actionButton={actionButton}
      showSettings={showSettings}
      expanded={true}
      onNavigate={close}
    />
  );
}

type AppSidebarProps = {
  nav: NavItem[];
  actionButton?: ActionButton;
  showSettings?: boolean;
};

export function AppSidebar({ nav, actionButton, showSettings = true }: AppSidebarProps) {
  // CSS handles visibility via hidden md:flex - no JS needed, avoids hydration mismatch
  return (
    <DesktopSidebar
      nav={nav}
      actionButton={actionButton}
      showSettings={showSettings}
    />
  );
}

// Export mobile components for use in layouts
export function AppMobileSidebar({
  nav,
  actionButton,
  showSettings = true,
}: AppSidebarProps) {
  return (
    <MobileSidebarContent>
      <MobileSidebarNav
        nav={nav}
        actionButton={actionButton}
        showSettings={showSettings}
      />
    </MobileSidebarContent>
  );
}

export { MobileSidebarProvider, MobileSidebarTrigger };
export default AppSidebar;
