// lib/cookies.ts
import { NextResponse } from "next/server";

export function setAccessCookie(
  res: NextResponse,
  token: string,
  maxAgeSec = 900
) {
  res.cookies.set("access_token", token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSec,
  });
}
export function clearAccessCookie(res: NextResponse) {
  res.cookies.set("access_token", "", { path: "/", maxAge: 0 });
}
