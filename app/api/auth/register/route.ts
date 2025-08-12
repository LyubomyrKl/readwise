import { NextResponse } from "next/server";
import { authApi } from "@/lib/sdk";
import { setAccessCookie, setRefreshCookie } from "@/lib/cookies";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { data } = await authApi.register({ registerDto: body });
    const { user, tokens } = data;
    const res = NextResponse.json(
      {
        ...user,
      },
      { status: 201 }
    );
    setAccessCookie(res, tokens.accessToken);
    setRefreshCookie(res, tokens.refreshToken);
    return res;
  } catch (error) {
    let errorMessage = "Registration failed";
    if (error && typeof error === "object" && "message" in error) {
      errorMessage = (error as { message?: string }).message || errorMessage;
    }
    return NextResponse.json({ error: errorMessage }, { status: 400 });
  }
}
