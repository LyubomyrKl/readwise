import { NextRequest, NextResponse } from "next/server";
import { apiBaseUrl } from "@platform/api/cookies";
import { forwardedFor } from "@platform/api/proxy";

/** Passkey sign-in options from the API (the browser never talks to the API directly). */
export async function POST(req: NextRequest) {
  const body: unknown = await req.json().catch(() => ({}));
  try {
    const upstream = await fetch(`${apiBaseUrl()}/api/auth/passkeys/login/options`, {
      method: "POST",
      headers: { "content-type": "application/json", ...forwardedFor(req.headers) },
      body: JSON.stringify(body ?? {}),
    });
    const data: unknown = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: upstream.status });
  } catch {
    return NextResponse.json({ message: "Passkey sign-in is unavailable" }, { status: 502 });
  }
}
