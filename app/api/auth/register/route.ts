import { NextRequest, NextResponse } from "next/server";
import { authApi, setTokensToCookies, axios } from "@/lib/api";
import type { RegisterDto } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const registerDto = (await req.json()) as RegisterDto;

    const resp = await authApi.register(registerDto);

    await setTokensToCookies(resp.data.tokens);

    return NextResponse.json(resp.data?.user ?? {}, { status: resp.status });
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      return NextResponse.json(error.response.data, {
        status: error.response.status,
      });
    }
    return NextResponse.json(
      { error: "Registration failed" },
      { status: 500 }
    );
  }
}
