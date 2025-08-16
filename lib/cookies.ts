// lib/cookies.ts
import { NextResponse } from "next/server";

export function clearAccessCookie(res: NextResponse) {
  res.cookies.set("access_token", "", { path: "/", maxAge: 0 });
}
export function getAccessCookie(req: Request): string | null {
  const cookies = req.headers.get("cookie");
  if (!cookies) return null;
  const match = cookies.match(/access_token=([^;]+)/);
  return match ? match[1] : null;
}

export function setAccessCookie(
  res: NextResponse,
  token: string,
  maxAge = 900
) {
  res.cookies.set("access_token", token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge,
  });
}

export function setRefreshCookie(
  res: NextResponse,
  token: string,
  maxAge = 60 * 60 * 24 * 7
) {
  res.cookies.set("refresh_token", token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge,
  });
}
export function clearAuthCookies(res: NextResponse) {
  res.cookies.set("access_token", "", { 
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/", 
    maxAge: 0 
  });
  res.cookies.set("refresh_token", "", { 
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/", 
    maxAge: 0 
  });
}
