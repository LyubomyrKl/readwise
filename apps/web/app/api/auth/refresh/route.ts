import { NextRequest, NextResponse } from "next/server";
import { apiBaseUrl, deleteTokensFromCookies, REFRESH_COOKIE, setTokensToCookies } from "@platform/api/cookies";
import type { Tokens } from "@platform/api/types";

/** Renews the access token from the refresh cookie (the proxy does this by itself; kept for explicit calls). */
export async function POST(req: NextRequest) {
  const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) {
    return NextResponse.json({ message: "No refresh token" }, { status: 401 });
  }
  try {
    const upstream = await fetch(`${apiBaseUrl()}/api/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    const data: unknown = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      if (upstream.status === 401) await deleteTokensFromCookies();
      return NextResponse.json(data, { status: upstream.status });
    }
    await setTokensToCookies(data as Tokens);
    return NextResponse.json({ accessToken: (data as Tokens).accessToken }, { status: 200 });
  } catch {
    return NextResponse.json({ message: "Refresh failed" }, { status: 502 });
  }
}
