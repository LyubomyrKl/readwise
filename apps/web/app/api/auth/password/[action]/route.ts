import { NextRequest, NextResponse } from "next/server";
import { apiBaseUrl } from "@platform/api/cookies";
import { forwardedFor } from "@platform/api/proxy";

/** Forgot password and the one-time link: no session in play, so the API's answer as it is. */
const ACTIONS = new Set(["forgot", "reset"]);

export async function POST(req: NextRequest, context: { params: Promise<{ action: string }> }) {
  const { action } = await context.params;
  if (!ACTIONS.has(action)) return NextResponse.json({ message: "Not found" }, { status: 404 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON in request body" }, { status: 400 });
  }
  try {
    const upstream = await fetch(`${apiBaseUrl()}/api/auth/password/${action}`, {
      method: "POST",
      // the caller's address, for the API's limits on these calls
      headers: { "content-type": "application/json", ...forwardedFor(req.headers) },
      body: JSON.stringify(body),
    });
    const data: unknown = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: upstream.status });
  } catch {
    return NextResponse.json({ message: "The server could not be reached" }, { status: 502 });
  }
}
