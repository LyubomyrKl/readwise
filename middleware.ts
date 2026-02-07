// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ROUTES } from "./app/(consts)/routes";

// Protected route patterns - use regex for dynamic routes
const PROTECTED_PATTERNS: RegExp[] = [
  /^\/reader\/library$/,
  /^\/reader\/book\/[^/]+/, // Matches /reader/book/{id} and any subpaths
  /^\/reader\/ingest\/upload$/,
  /^\/learning(\/|$)/, // Matches /learning and all subpaths
  /^\/dictionary(\/|$)/, // Matches /dictionary and all subpaths
  /^\/settings(\/|$)/, // Matches /settings and all subpaths
];

// Public routes that should redirect to reader if already logged in
const AUTH_ROUTES = [ROUTES.auth.login, ROUTES.auth.register];

function needsAuth(path: string): boolean {
  return PROTECTED_PATTERNS.some((pattern) => pattern.test(path));
}

function isAuthRoute(path: string): boolean {
  return (AUTH_ROUTES as readonly string[]).includes(path);
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get("access_token")?.value;

  // If on auth page and already logged in, redirect to reader
  if (isAuthRoute(pathname) && token) {
    return NextResponse.redirect(new URL(ROUTES.reader.library, req.url));
  }

  // If protected route and no token, redirect to login
  if (needsAuth(pathname) && !token) {
    const url = new URL(ROUTES.auth.login, req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all paths except static files and api routes
    "/((?!_next/static|_next/image|favicon.ico|api/).*)",
  ],
};
