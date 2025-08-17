// middleware.ts
import { NextResponse, NextRequest } from "next/server";
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
  /^\/reader\/book\/[^/]+$/,
  /^\/reader\/book\/[^/]+\/profile$/,
];

function needsAuth(path: string) {
  if (PROTECTED_EXACT.has(path)) return true;
  return PROTECTED_PATTERNS.some((re) => re.test(path));
}

// allow override; default to 'at'
const AT_COOKIE = process.env.NEXT_PUBLIC_AT_COOKIE || "at";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!needsAuth(pathname)) return NextResponse.next();

  const token =
    req.cookies.get(AT_COOKIE)?.value ??
    req.cookies.get("at")?.value ??
    req.cookies.get("access_token")?.value; // legacy

  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = ROUTES.auth.login;
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}
