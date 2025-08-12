// app/api/auth/register/route.ts
import { NextResponse } from "next/server";
import { authApi } from "@/lib/sdk";
import { setAccessCookie, setRefreshCookie } from "@/lib/cookies";

export async function POST(req: Request) {
  const body = await req.json(); // { email, password, name? }
  const { data } = await authApi.register({ registerDto: body });
  const { user, tokens } = data; // { accessToken, refreshToken }
  const res = NextResponse.json({ user }, { status: 201 });
  setAccessCookie(res, tokens.accessToken);
  setRefreshCookie(res, tokens.refreshToken);
  return res;
}
