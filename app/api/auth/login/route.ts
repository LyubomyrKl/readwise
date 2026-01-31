import { authApi, setTokensToCookies, axios } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import type { LoginDto } from "@/lib/types";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as LoginDto;

  try {
    const resp = await authApi.login(body);

    await setTokensToCookies(resp.data.tokens);

    return NextResponse.json(resp.data, { status: resp.status });
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response) {
      return NextResponse.json(error.response.data, {
        status: error.response.status,
      });
    }
    return NextResponse.json({ message: "Login failed" }, { status: 500 });
  }
}
