"use client";

import {
  AppSidebar,
  AppMobileSidebar,
  MobileSidebarProvider,
  MobileSidebarTrigger,
  NavItem,
  ActionButton,
} from "@/app/(components)/AppSidebar";
import { BookOpen, Plus, Tags } from "lucide-react";
import { ROUTES } from "@/app/(consts)/routes";

const nav: NavItem[] = [
  { title: "All Words", icon: BookOpen, href: ROUTES.dictionary.list },
  { title: "Groups", icon: Tags, href: "/dictionary/groups" },
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
  return (
    <MobileSidebarProvider>
      <div className="flex min-h-dvh">
        <AppSidebar nav={nav} actionButton={actionButton} />
        <AppMobileSidebar nav={nav} actionButton={actionButton} />
        <main className="flex-1 min-h-dvh min-w-0 overflow-y-auto relative">
          <div className="fixed top-3 right-3 z-30 md:hidden">
            <MobileSidebarTrigger className="bg-background/80 backdrop-blur-sm shadow-md border" />
          </div>
          <div className="p-4 md:p-6">{children}</div>
        </main>
      </div>
    </MobileSidebarProvider>
  );
}
