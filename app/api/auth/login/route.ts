// app/api/auth/login/route.ts
import { NextResponse } from "next/server";
import { authApi } from "@/lib/sdk";
import { setAccessCookie, setRefreshCookie } from "../../../../lib/cookies";

export async function POST(req: Request) {
  const body = await req.json(); // { email, password }
  if (!body.email || !body.password) {
    return NextResponse.json(
      { message: "Email and password are required" },
      { status: 400 }
    );
  }
  const { data } = await authApi.login({ loginDto: body });
  const { user, tokens } = data;
  const res = NextResponse.json({ ...user }, { status: 200 });

  setAccessCookie(res, tokens.accessToken);
  setRefreshCookie(res, tokens.refreshToken);

  return res;
}
