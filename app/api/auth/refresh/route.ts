// app/api/auth/refresh/route.ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authApi } from "@/lib/sdk";
import {
  setAccessCookie,
  setRefreshCookie,
  clearAuthCookies,
} from "@/lib/cookies";

export async function POST() {
  const rt = (await cookies()).get("refresh_token")?.value;

  if (!rt) return new NextResponse(null, { status: 401 });

  try {
    const { data } = await authApi.refresh({
      refreshDto: { refreshToken: `Bearer ${rt}` },
    });

    const res = NextResponse.json(
      { accessToken: data.accessToken, refreshToken: data.refreshToken },
      { status: 200 }
    );

    setAccessCookie(res, data.accessToken);
    setRefreshCookie(res, data.refreshToken);

    return res;
  } catch {
    const res = new NextResponse(null, { status: 401 });
    clearAuthCookies(res);
    return res;
  }
}
