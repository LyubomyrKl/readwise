import { NextRequest, NextResponse } from "next/server";
import { apiBaseUrl, setTokensToCookies } from "@platform/api/cookies";
import { forwardedFor } from "@platform/api/proxy";
import type { AuthBundle } from "@platform/api/types";

/** Signs in against the API and stores the tokens in httpOnly cookies; the page gets the user, never the tokens. */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON in request body" }, { status: 400 });
  }
  try {
    const upstream = await fetch(`${apiBaseUrl()}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", ...forwardedFor(req.headers) },
      body: JSON.stringify(body),
    });
    const data: unknown = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return NextResponse.json(data, { status: upstream.status });
    }
    const bundle = data as AuthBundle;
    await setTokensToCookies(bundle.tokens);
    return NextResponse.json({ user: bundle.user }, { status: upstream.status });
  } catch {
    return NextResponse.json({ message: "Login failed" }, { status: 502 });
  }
}
