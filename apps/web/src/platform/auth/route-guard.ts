import { PLATFORM_ROUTES, TOOLS_BASE_PATH } from "@platform/routes";

/** Everything under these prefixes, plus the dashboard itself, needs a session. */
export const PROTECTED_PREFIXES: readonly string[] = [
  TOOLS_BASE_PATH,
  PLATFORM_ROUTES.settings.root,
];

export function needsAuth(pathname: string): boolean {
  if (pathname === PLATFORM_ROUTES.home) return true;
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function isAuthRoute(pathname: string): boolean {
  return (
    pathname === PLATFORM_ROUTES.auth.login ||
    pathname === PLATFORM_ROUTES.auth.register
  );
}
