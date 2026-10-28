import { NextRequest, NextResponse } from "next/server";
import { apiBaseUrl, deleteTokensFromCookies, readTokens } from "@platform/api/cookies";
import { PLATFORM_ROUTES } from "@platform/routes";

/**
 * Ends the session at the API (best effort) and always clears the cookies.
 * Body { everywhere: true } ends every session of the user instead of this one.
 */
export async function POST(req: NextRequest) {
  let everywhere = false;
  try {
    const body = (await req.json()) as { everywhere?: unknown } | null;
    everywhere = body?.everywhere === true;
  } catch {
    // no body: this session only
  }
  const { accessToken } = await readTokens();
  if (accessToken) {
    try {
      await fetch(`${apiBaseUrl()}/api/auth/${everywhere ? "logout-all" : "logout"}`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}` },
      });
    } catch (error) {
      console.error("Logout API error:", error);
    }
  }
  await deleteTokensFromCookies();
  return NextResponse.json({ redirectTo: PLATFORM_ROUTES.auth.login });
}
