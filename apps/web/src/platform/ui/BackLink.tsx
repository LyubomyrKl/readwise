"use client";

import { useCallback, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/** The part of the browser's Navigation API used here (TypeScript's DOM types do not have it yet). */
export interface HistoryEntries {
  currentEntry: { index: number } | null;
  entries(): { url: string | null }[];
}

/**
 * Whether the page before this one in the tab's history is one of the app's own. Not when the page
 * was opened directly (a new tab, a bookmark), right after signing in, or in a browser without the
 * Navigation API: back would leave the app then, so going back means going up instead.
 */
export function previousIsInApp(navigation: HistoryEntries | undefined, origin: string): boolean {
  const index = navigation?.currentEntry?.index ?? -1;
  if (!navigation || index < 1) return false;
  const url = navigation.entries()[index - 1]?.url;
  if (!url) return false;
  const previous = new URL(url);
  return previous.origin === origin && !previous.pathname.startsWith("/auth");
}

const canGoBack = () =>
  previousIsInApp((window as Window & { navigation?: HistoryEntries }).navigation, window.location.origin);

/** Back to the page you came from, like the browser's back button; up to `fallback` when there is none in the app. */
export function useBack(fallback: string): () => void {
  const router = useRouter();
  return useCallback(() => {
    if (canGoBack()) router.back();
    else router.push(fallback);
  }, [router, fallback]);
}

/**
 * The back arrow at the top of a page: back where you came from, or up to `fallback` when the page
 * was opened directly. It links to `fallback`, so opening it in a new tab works too.
 */
export function BackLink({ fallback, className, children = "Back" }: { fallback: string; className?: string; children?: ReactNode }) {
  const router = useRouter();
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    // a new tab or window opens the link's own address
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (canGoBack()) {
      event.preventDefault();
      router.back();
    }
  };
  return (
    <Link
      href={fallback}
      onClick={onClick}
      className={cn("inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground", className)}
    >
      <ArrowLeft className="h-4 w-4" /> {children}
    </Link>
  );
}
