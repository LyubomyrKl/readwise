import { NextRequest, NextResponse } from "next/server";
import { apiBaseUrl, deleteTokensFromCookies, REFRESH_COOKIE, setTokensToCookies } from "@platform/api/cookies";
import { refreshTokens } from "@platform/api/proxy";

/** Rotates the session from the refresh cookie (the proxy does this by itself; kept for explicit calls). */
export async function POST(req: NextRequest) {
  const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) {
    return NextResponse.json({ message: "No refresh token" }, { status: 401 });
  }
  const tokens = await refreshTokens({
    apiBase: apiBaseUrl(),
    refreshToken,
    setTokens: setTokensToCookies,
    clearTokens: deleteTokensFromCookies,
    forwardedFor: req.headers.get("x-forwarded-for") ?? undefined,
  });
  if (!tokens) {
    return NextResponse.json({ message: "Session expired" }, { status: 401 });
  }
  // the new pair lives in the httpOnly cookies only
  return NextResponse.json({ ok: true }, { status: 200 });
}
