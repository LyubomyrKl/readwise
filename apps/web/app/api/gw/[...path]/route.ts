import type { NextRequest } from "next/server";
import { proxyRequest } from "@platform/api/proxy";
import { apiBaseUrl, deleteTokensFromCookies, readTokens, setTokensToCookies } from "@platform/api/cookies";

export const dynamic = "force-dynamic";

/**
 * /api/gw/<path> -> API_URL/api/<path>, authenticated with the session cookies.
 * The only server-side route besides the four auth routes; see src/platform/api/proxy.ts.
 */
async function handler(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const { accessToken, refreshToken } = await readTokens();
  return proxyRequest(request, path, request.nextUrl.search, {
    apiBase: apiBaseUrl(),
    accessToken,
    refreshToken,
    setTokens: setTokensToCookies,
    clearTokens: deleteTokensFromCookies,
    forwardedFor: request.headers.get("x-forwarded-for") ?? undefined,
  });
}

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE, handler as HEAD };
