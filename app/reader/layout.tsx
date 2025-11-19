"use client";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar, Section } from "@/app/(components)/AppSidebar";
import { Library, UploadCloud, FolderOpen, Sparkles } from "lucide-react";
import { useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import { ROUTES } from "../(consts)/routes";

const nav: Section[] = [
  { title: "Library", icon: Library, href: ROUTES.reader.library },
  {
    title: "Collections",
    icon: FolderOpen,
    defaultOpen: true,
    items: [
      { title: "All", href: ROUTES.reader.collections.all },
      { title: "New", href: ROUTES.reader.collections.new },
      { title: "Archived", href: ROUTES.reader.collections.archived },
    ],
  },
  {
    title: "Ingest",
    icon: UploadCloud,
    items: [
      { title: "Upload files", href: ROUTES.reader.ingest.uploadFiles },
      { title: "Web import", href: ROUTES.reader.ingest.webImport },
    ],
  },
  { title: "AI Workbench", icon: Sparkles, href: ROUTES.reader.aiWorkbench },
];

function LayoutInner({ children }: { children: React.ReactNode }) {
  const { setOpen, open } = useSidebar();
  const sidebarRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  
  // Check if we're in a book reading route (reader subpath)
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

  // For book reading routes (EPUB/PDF readers), render without sidebar
  if (isBookReaderRoute) {
    return (
      <div className="min-h-dvh w-full">
        {children}
      </div>
    );
  }

  // Default layout with sidebar for other routes (including profile)
  return (
    <div className="flex grow min-h-dvh">
      <div ref={sidebarRef}>
        <AppSidebar Icon={Sparkles} sidebarTitle="Summarizer" nav={nav} />
      </div>
      <main className="flex-1 min-h-dvh min-w-0 w-full overflow-y-auto">
        {children}
      </main>
    </div>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider defaultOpen={true}>
      <LayoutInner>{children}</LayoutInner>
    </SidebarProvider>
  );
}
