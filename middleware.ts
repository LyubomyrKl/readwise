// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ROUTES } from "./app/consts/pages";

const PROTECTED = new Set<string>([
  ROUTES.reader.library,
  ROUTES.reader.collections.all,
  ROUTES.reader.collections.new,
  ROUTES.reader.collections.archived,
  ROUTES.reader.ingest.uploadFiles,
  ROUTES.reader.ingest.webImport,
  ROUTES.reader.aiWorkbench,
]);

function needsAuth(path: string) {
  if (PROTECTED.has(path)) return true;
  // allow section-wide protection
  if (path.startsWith("/collections/")) return true;
  if (path.startsWith("/ingest/")) return true;
  return false;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!needsAuth(pathname)) return NextResponse.next();

  const token = req.cookies.get("access_token")?.value;
  if (!token) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // cheap exp check; full verify happens server-side
  try {
    const [, payload] = token.split(".");
    const { exp } = JSON.parse(Buffer.from(payload, "base64").toString());
    if (!exp || Date.now() > exp * 1000) {
      const url = new URL("/login", req.url);
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  } catch {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

// protect exact pages and section roots
export const config = {
  matcher: [
    ROUTES.reader.library,
    ROUTES.reader.collections.all,
    ROUTES.reader.ingest.uploadFiles,
    ROUTES.reader.ingest.webImport,
    ROUTES.reader.aiWorkbench,
  ],
};
