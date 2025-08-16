// app/api/auth/refresh/route.ts
import { NextResponse } from "next/server";
import { authApi } from "@/lib/sdk";
import {
  setAccessCookie,
  setRefreshCookie,
  clearAuthCookies,
} from "@/lib/cookies";

export async function POST(request: Request) {
  const body = await request.json();
  const rt = body.refreshToken;

  if (!rt) return new NextResponse(null, { status: 401 });

  try {
    const { data } = await authApi.refresh({
      refreshDto: { refreshToken: `Bearer ${rt}` },
    });

    console.log("Auth API response:", data);
    console.log("Access token from API:", data.accessToken);
    console.log("Refresh token from API:", data.refreshToken);

    const responsePayload = { 
      accessToken: data.accessToken, 
      refreshToken: data.refreshToken 
    };
    
    console.log("Response payload:", responsePayload);

    const res = NextResponse.json(responsePayload, { status: 200 });

    setAccessCookie(res, data.accessToken);
    setRefreshCookie(res, data.refreshToken);

    return res;
  } catch {
    const res = new NextResponse(null, { status: 401 });
    clearAuthCookies(res);
    return res;
  }
}
