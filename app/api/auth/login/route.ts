import { createServerSdk, setTokensToCookies } from "@/lib/sdk";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { authApi } = createServerSdk();

  try {
    const resp = await authApi.login({ loginDto: body });

    await setTokensToCookies(resp.data.tokens, cookies());

    return NextResponse.json(resp.data, { status: resp.status });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "response" in error) {
      const axiosError = error as { response: { data: unknown; status: number } };
      return NextResponse.json(axiosError.response.data, {
        status: axiosError.response.status,
      });
    }
    return NextResponse.json({ message: "Login failed" }, { status: 500 });
  }
}
