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

/**
 * Where to go after signing in: a path on this site, nothing else. Another
 * host ("https://…", "//host", "/\host") or a script URL falls back, so a link
 * to the login page cannot send a fresh session elsewhere or run code in it.
 */
export function safeNext(next: string | null | undefined, origin: string, fallback: string = PLATFORM_ROUTES.home): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  try {
    const url = new URL(next, origin);
    return url.origin === origin ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch {
    return fallback;
  }
}
