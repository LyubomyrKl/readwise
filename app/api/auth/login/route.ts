// app/api/auth/login/route.ts
import { NextResponse } from "next/server";
import { authApi } from "@/lib/sdk";
import { setAccessCookie, setRefreshCookie } from "../../../../lib/cookies";
import { LoginReq } from "../schemas";
import z from "zod";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as z.infer<typeof LoginReq>;

    const loginDto = LoginReq.parse(body);

    const { data } = await authApi.login({ loginDto });

    const { user, tokens } = data;

    if (!user || !tokens) {
      return NextResponse.json(
        { error: "Invalid login response" },
        { status: 400 }
      );
    }

    const res = NextResponse.json({ ...user }, { status: 200 });

    setAccessCookie(res, tokens.accessToken);
    setRefreshCookie(res, tokens.refreshToken);

    return res;
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
