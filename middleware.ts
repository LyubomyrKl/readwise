// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ROUTES } from "./app/(consts)/pages";

const PROTECTED_EXACT = new Set<string>([
  ROUTES.reader.library,
  ROUTES.reader.collections.all,
  ROUTES.reader.collections.new,
  ROUTES.reader.collections.archived,
  ROUTES.reader.ingest.uploadFiles,
  ROUTES.reader.ingest.webImport,
  ROUTES.reader.aiWorkbench,
  ROUTES.settings,
]);

const PROTECTED_PATTERNS = [
  /^\/reader\/book\/[^\/]+$/, // Matches /reader/book/{id}
  /^\/reader\/book\/[^\/]+\/profile$/, // Matches /reader/book/{id}/profile
];

function needsAuth(path: string) {
  // Check exact matches
  if (PROTECTED_EXACT.has(path)) return true;

  // Check pattern matches for dynamic routes
  return PROTECTED_PATTERNS.some(pattern => pattern.test(path));
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!needsAuth(pathname)) return NextResponse.next();

  const token = req.cookies.get("access_token")?.value;
  if (!token) {
    const url = new URL(ROUTES.auth.login, req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}
