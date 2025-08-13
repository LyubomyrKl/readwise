import { NextResponse, NextRequest } from "next/server";
import { authApi } from "@/lib/sdk";
import { setAccessCookie, setRefreshCookie } from "@/lib/cookies";
import { registerReqSchema } from "../schemas";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const registerDto = registerReqSchema.parse(body);

    const { data } = await authApi.register({ registerDto });
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
