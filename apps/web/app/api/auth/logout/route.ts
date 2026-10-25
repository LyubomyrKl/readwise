import { NextResponse } from "next/server";
import { apiBaseUrl, deleteTokensFromCookies, readTokens } from "@platform/api/cookies";
import { PLATFORM_ROUTES } from "@platform/routes";

/** Revokes the session at the API (best effort) and always clears the cookies. */
export async function POST() {
  const { accessToken } = await readTokens();
  if (accessToken) {
    try {
      await fetch(`${apiBaseUrl()}/api/auth/logout`, {
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
