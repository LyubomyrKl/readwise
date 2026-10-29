import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { PLATFORM_ROUTES } from "@platform/routes";
import { isAuthRoute, needsAuth } from "@platform/auth/route-guard";

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const accessToken = req.cookies.get("access_token")?.value;
  const refreshToken = req.cookies.get("refresh_token")?.value;

  // Already signed in: the auth pages send the user to the dashboard.
  // (An expired access token with a live refresh token is refreshed by the page itself.)
  if (isAuthRoute(pathname) && (accessToken || refreshToken)) {
    return NextResponse.redirect(new URL(PLATFORM_ROUTES.home, req.url));
  }

  // No session at all on a protected route: sign in, then come back here.
  if (needsAuth(pathname) && !accessToken && !refreshToken) {
    const url = new URL(PLATFORM_ROUTES.auth.login, req.url);
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Everything except static assets and the server-side API routes
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
