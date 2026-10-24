import { authApi, setTokensToCookies, axios } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import type { LoginDto } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as LoginDto;
    const resp = await authApi.login(body);

    await setTokensToCookies(resp.data.tokens);

    return NextResponse.json(resp.data, { status: resp.status });
  } catch (error: unknown) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ message: "Invalid JSON in request body" }, { status: 400 });
    }
    if (axios.isAxiosError(error) && error.response) {
      return NextResponse.json(error.response.data, {
        status: error.response.status,
      });
    }
    return NextResponse.json({ message: "Login failed" }, { status: 500 });
  }
}
