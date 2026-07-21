"use client";

import {
  AppSidebar,
  AppMobileSidebar,
  MobileSidebarProvider,
  MobileSidebarTrigger,
  NavItem,
} from "@/app/(components)/AppSidebar";
import { Library, UploadCloud } from "lucide-react";
import { usePathname } from "next/navigation";
import { ROUTES } from "../(consts)/routes";

const nav: NavItem[] = [
  { title: "Library", icon: Library, href: ROUTES.reader.library },
  {
    title: "Ingest",
    icon: UploadCloud,
    items: [
      { title: "Upload files", href: ROUTES.reader.ingest.uploadFiles },
    ],
  },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isBookReaderRoute = pathname?.match(/\/reader\/book\/[^/]+\/reader/) !== null;

  if (isBookReaderRoute) {
    return <div className="min-h-dvh w-full">{children}</div>;
  }

  return (
    <MobileSidebarProvider>
      <div className="flex min-h-dvh">
        <AppSidebar nav={nav} />
        <AppMobileSidebar nav={nav} />
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
