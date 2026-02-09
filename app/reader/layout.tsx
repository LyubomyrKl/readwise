"use client";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar, NavItem } from "@/app/(components)/AppSidebar";
import { Library, UploadCloud } from "lucide-react";
import { useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import { ROUTES } from "../(consts)/routes";
import { useIsMobile } from "@/hooks/use-mobile";

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
  const { setOpen, open } = useSidebar();
  const sidebarRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const isMobile = useIsMobile();

  const isBookReaderRoute = pathname?.match(/\/reader\/book\/[^/]+\/reader/) !== null;

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

  if (isBookReaderRoute) {
    return (
      <div className="min-h-dvh w-full">
        {children}
      </div>
    );
  }

  return (
    <div className="flex grow min-h-dvh">
      <div ref={sidebarRef}>
        <AppSidebar nav={nav} />
      </div>
      <main className="flex-1 min-h-dvh min-w-0 w-full overflow-y-auto relative">
        {isMobile && (
          <div className="fixed top-3 right-3 z-50 md:hidden">
            <SidebarTrigger className="bg-background/80 backdrop-blur-sm shadow-md border" />
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
