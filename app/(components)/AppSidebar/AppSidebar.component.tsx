"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Settings, ChevronRight, Plus } from "lucide-react";
import { AppSwitcher } from "@/components/AppSwitcher";
import { Button } from "@/components/ui/button";

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

function ActiveLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isExactMatch = pathname === href;
  const isChildMatch = href !== "/" && pathname?.startsWith(href + "/");
  const active = isExactMatch || isChildMatch;

  return (
    <SidebarMenuButton asChild isActive={!!active}>
      <Link href={href}>{children}</Link>
    </SidebarMenuButton>
  );
}

type AppSidebarProps = {
  nav: NavItem[];
  actionButton?: ActionButton;
  showSettings?: boolean;
};

export function AppSidebar({ nav, actionButton, showSettings = true }: AppSidebarProps) {
  const { setOpen, open } = useSidebar();

  return (
    <Sidebar collapsible="icon" onClick={() => setOpen(true)}>
      <SidebarHeader>
        <div className="px-1 py-1">
          <AppSwitcher showLabel={open} />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {nav.map((entry, i) => {
              // simple link
              if ("href" in entry) {
                const Icon = entry.icon;
                return (
                  <SidebarMenuItem key={i}>
                    <ActiveLink href={entry.href}>
                      <Icon className="h-4 w-4" />
                      <span>{entry.title}</span>
                    </ActiveLink>
                  </SidebarMenuItem>
                );
              }

              // collapsible group
              const Icon = entry.icon;
              return (
                <Collapsible
                  key={i}
                  defaultOpen={entry.defaultOpen}
                  className="group/collapsible"
                >
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton>
                        <Icon className="h-4 w-4" />
                        <span>{entry.title}</span>
                        <ChevronRight className="ml-auto size-4 transition-transform group-data-[state=open]/collapsible:rotate-90" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {entry.items.map((it) => (
                          <SidebarMenuSubItem key={it.href}>
                            <ActiveLink href={it.href}>
                              <span>{it.title}</span>
                            </ActiveLink>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>

        {/* Action Button */}
        {actionButton && open && (
          <div className="px-3 mt-2">
            <Link href={actionButton.href}>
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
      </SidebarContent>

      {showSettings && (
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <ActiveLink href="/settings">
                <Settings className="h-4 w-4" />
                <span>Settings</span>
              </ActiveLink>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}

export default AppSidebar;
