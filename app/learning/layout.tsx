"use client";

import {
  AppSidebar,
  AppMobileSidebar,
  MobileSidebarProvider,
  MobileSidebarTrigger,
  NavItem,
  ActionButton,
} from "@/app/(components)/AppSidebar";
import { Brain, BookOpen, BarChart3, Plus } from "lucide-react";
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

export default function LearningLayout({
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
