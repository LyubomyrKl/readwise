import { NextRequest, NextResponse } from "next/server";
import { apiBaseUrl, deleteTokensFromCookies, readTokens } from "@platform/api/cookies";
import { forgetRefreshes, forwardedFor, refreshTokens } from "@platform/api/proxy";
import { PLATFORM_ROUTES } from "@platform/routes";

/**
 * Ends the session at the API and always clears the cookies. Body
 * { everywhere: true } ends every session of the user instead of this one.
 * The access cookie lives 15 minutes: when it is gone the refresh cookie gets
 * a fresh one first, so signing out is never a silent no-op. Answers an error
 * (cookies cleared all the same) when the API did not confirm the revocation.
 */
export async function POST(req: NextRequest) {
  let everywhere = false;
  try {
    const body = (await req.json()) as { everywhere?: unknown } | null;
    everywhere = body?.everywhere === true;
  } catch {
    // no body: this session only
  }
  const redirectTo = PLATFORM_ROUTES.auth.login;
  const apiBase = apiBaseUrl();
  const { accessToken: stored, refreshToken } = await readTokens();
  let accessToken = stored;
  if (!accessToken && refreshToken) {
    const noop = async () => undefined;
    accessToken = (await refreshTokens({ apiBase, refreshToken, setTokens: noop, clearTokens: noop, forwardedFor: req.headers.get("x-forwarded-for") ?? undefined }))?.accessToken;
  }
  let revoked = false;
  if (accessToken) {
    try {
      const upstream = await fetch(`${apiBase}/api/auth/${everywhere ? "logout-all" : "logout"}`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, ...forwardedFor(req.headers) },
      });
      revoked = upstream.ok;
    } catch (error) {
      console.error("Logout API error:", error);
    }
  }
  if (refreshToken) forgetRefreshes(refreshToken);
  await deleteTokensFromCookies();
  if (revoked || (!everywhere && !stored && !refreshToken)) return NextResponse.json({ redirectTo });
  const message = !accessToken
    ? "Your session had already ended here; sign in again to sign out other devices"
    : everywhere
      ? "Signed out here, but the server did not confirm ending the other sessions; try again after signing in"
      : "Signed out here, but the server did not confirm ending the session";
  return NextResponse.json({ message, redirectTo }, { status: accessToken ? 502 : 401 });
}
