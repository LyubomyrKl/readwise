// app/api/auth/refresh/route.ts
import { NextResponse } from "next/server";
import { authApi } from "@/lib/sdk";
import {
  setAccessCookie,
  setRefreshCookie,
  clearAuthCookies,
} from "@/lib/cookies";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rt = body.refreshToken;

    console.log("Refresh token request:", rt);
    console.log("Request body:", body);

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
    } catch (error) {
      const res = new NextResponse(null, { status: 401 });
      clearAuthCookies(res);
      return res;
    }
  } catch (parseError) {
    console.error("Failed to parse request body:", parseError);
    return new NextResponse(null, { status: 400 });
  }
}
