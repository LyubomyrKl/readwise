"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Cleans up any stuck overlay/dialog styles when navigating between routes.
 * This fixes an issue where Radix UI dialogs can leave pointer-events and
 * scroll lock styles on the body when unmounting during navigation on mobile.
 */
export function NavigationCleanup() {
  const pathname = usePathname();
  const prevPathname = useRef(pathname);

  useEffect(() => {
    // Only run cleanup when pathname actually changes (not on initial mount)
    if (prevPathname.current === pathname) {
      prevPathname.current = pathname;
      return;
    }
    prevPathname.current = pathname;

    // Clear any stuck body/html styles from Radix dialogs on route change
    const cleanup = () => {
      // Clear body styles
      document.body.style.pointerEvents = '';
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
      document.body.style.marginRight = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.width = '';

      // Clear html styles (react-remove-scroll can add these)
      document.documentElement.style.overflow = '';
      document.documentElement.style.paddingRight = '';
      document.documentElement.style.pointerEvents = '';

      // Remove any data attributes Radix/react-remove-scroll might have left
      document.body.removeAttribute('data-scroll-locked');
      document.documentElement.removeAttribute('data-scroll-locked');

      // Remove any orphaned Radix portal overlays that might be stuck
      // These have data-radix-portal attribute and contain overlay elements
      const portalOverlays = document.querySelectorAll('[data-radix-portal]');
      portalOverlays.forEach((portal) => {
        // Check if this portal contains a sheet/dialog overlay
        const overlay = portal.querySelector('[data-slot="sheet-overlay"]');
        if (overlay) {
          // Remove the entire portal if it has a stuck overlay
          portal.remove();
        }
      });

      // Also remove any direct overlay elements that might be orphaned
      const stuckOverlays = document.querySelectorAll(
        '[data-slot="sheet-overlay"], [data-state="open"][data-slot="sheet-content"]'
      );
      stuckOverlays.forEach((el) => {
        const portal = el.closest('[data-radix-portal]');
        if (portal) {
          portal.remove();
        }
      });

      // Remove any inline style attributes if they're empty after cleanup
      if (document.body.style.cssText === '') {
        document.body.removeAttribute('style');
      }
      if (document.documentElement.style.cssText.replace(/color-scheme:\s*\w+;?/gi, '').trim() === '') {
        // Keep color-scheme but remove other empty styles
        const colorScheme = document.documentElement.style.colorScheme;
        if (colorScheme) {
          document.documentElement.setAttribute('style', `color-scheme: ${colorScheme};`);
        }
      }
    };

    // Run cleanup immediately and also after delays to catch animations
    cleanup();
    const timeoutId1 = setTimeout(cleanup, 50);
    const timeoutId2 = setTimeout(cleanup, 150);
    const timeoutId3 = setTimeout(cleanup, 350);

    return () => {
      clearTimeout(timeoutId1);
      clearTimeout(timeoutId2);
      clearTimeout(timeoutId3);
    };
  }, [pathname]);

  return null;
}
