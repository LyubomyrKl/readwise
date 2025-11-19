// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ROUTES } from "./app/(consts)/routes";

const PROTECTED = new Set<string>([
  ROUTES.reader.library,
  ROUTES.reader.bookProfile("*"), // Placeholder for book ID
  ROUTES.reader.collections.all,
  ROUTES.reader.collections.new,
  ROUTES.reader.collections.archived,
  ROUTES.reader.ingest.uploadFiles,
  ROUTES.reader.ingest.webImport,
  ROUTES.reader.aiWorkbench,
  ROUTES.settings,
]);

function needsAuth(path: string) {
  if (PROTECTED.has(path)) return true;

  return false;
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
