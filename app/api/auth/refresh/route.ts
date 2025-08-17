import { createServerSdk } from "@/lib/sdk";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const refreshToken = req.cookies.get("refresh_token")?.value;

  if (!refreshToken) {
    const url = new URL("/auth/login", req.url);
    url.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  const { authApi } = createServerSdk();

  const resp = await authApi.refresh({ refreshDto: { refreshToken } });

  const out = NextResponse.json(resp.data ?? {}, { status: resp.status });

  return out;
}
