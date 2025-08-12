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
import { Settings, ChevronRight } from "lucide-react";
import { motion, useReducedMotion, Variants } from "framer-motion";

export type SubItem = { title: string; href: string };

export type Section =
  | { title: string; icon: React.ElementType; href: string }
  | {
      title: string;
      icon: React.ElementType;
      items: SubItem[];
      defaultOpen?: boolean;
    };

const ease = [0.2, 0.8, 0.2, 1];

function ActiveLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname?.startsWith(href + "/");
  return (
    <SidebarMenuButton asChild isActive={!!active}>
      <Link href={href}>{children}</Link>
    </SidebarMenuButton>
  );
}

type AppSidebarProps = {
  nav: Section[];
  sidebarTitle?: string;
  Icon: React.ElementType;
};

export function AppSidebar({ nav, sidebarTitle, Icon }: AppSidebarProps) {
  const { setOpen, open } = useSidebar();

  const prefersReduced = useReducedMotion();

  const titleVariants: Variants = prefersReduced
    ? {
        open: { opacity: 1 },
        shut: { opacity: 0 },
      }
    : {
        open: {
          opacity: 1,
          scaleX: 1,
          x: 0,
          transition: {
            opacity: { duration: 0.15 },
            scaleX: { duration: 0.25, ease: [0.25, 0.8, 0.25, 1] },
            x: { type: "spring", stiffness: 300, damping: 24 },
          },
        },
        shut: {
          opacity: 0,
          scaleX: 0.8,
          x: -8,
          transition: {
            opacity: { duration: 0.1 },
            scaleX: { duration: 0.15, ease: "easeInOut" },
            x: { duration: 0.15, ease: "easeInOut" },
          },
        },
      };

  return (
    <Sidebar collapsible="icon" onClick={() => setOpen(true)}>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1">
          {/* Icon stays always visible */}
          <Icon className="size-5 shrink-0" />

          {/* Animate only the text */}
          <motion.span
            className="font-semibold origin-left overflow-hidden whitespace-nowrap"
            variants={titleVariants}
            initial={false}
            animate={open ? "open" : "shut"}
            aria-hidden={!open}
          >
            {sidebarTitle}
          </motion.span>
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
                      <Icon />
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
                        <Icon />
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
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <ActiveLink href="/settings">
              <Settings />
              <span>Settings</span>
            </ActiveLink>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

export default AppSidebar;
