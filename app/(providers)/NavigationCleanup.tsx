"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Cleans up any stuck overlay/dialog styles when navigating between routes.
 * This fixes an issue where Radix UI dialogs can leave pointer-events and
 * scroll lock styles on the body when unmounting during navigation on mobile.
 */
export function NavigationCleanup() {
  const pathname = usePathname();

  useEffect(() => {
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

    // Run cleanup immediately and also after a short delay
    // to catch any animations completing
    cleanup();
    const timeoutId = setTimeout(cleanup, 100);

    return () => clearTimeout(timeoutId);
  }, [pathname]);

  return null;
}
