"use client";

import * as React from "react";
import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { X, PanelLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type MobileSidebarContextType = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
};

const MobileSidebarContext = createContext<MobileSidebarContextType | null>(null);

export function useMobileSidebar() {
  const context = useContext(MobileSidebarContext);
  if (!context) {
    throw new Error("useMobileSidebar must be used within MobileSidebarProvider");
  }
  return context;
}

export function MobileSidebarProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  // Close on route change
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, []);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  return (
    <MobileSidebarContext.Provider value={{ isOpen, open, close, toggle }}>
      {children}
    </MobileSidebarContext.Provider>
  );
}

export function MobileSidebarTrigger({ className }: { className?: string }) {
  const { toggle } = useMobileSidebar();

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("size-7", className)}
      onClick={toggle}
    >
      <PanelLeft className="h-4 w-4" />
      <span className="sr-only">Toggle Sidebar</span>
    </Button>
  );
}

export function MobileSidebarContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { isOpen, close } = useMobileSidebar();

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 md:hidden",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={close}
      />

      {/* Sidebar panel */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 bg-sidebar border-r transform transition-transform duration-300 ease-in-out md:hidden",
          isOpen ? "translate-x-0" : "-translate-x-full",
          className
        )}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-end p-2">
            <Button variant="ghost" size="icon" onClick={close} className="size-7">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto">{children}</div>
        </div>
      </div>
    </>
  );
}
