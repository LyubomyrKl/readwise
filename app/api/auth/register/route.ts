import { NextRequest, NextResponse } from "next/server";
import { setTokensToCookies, createServerSdk } from "@/lib/sdk";
import { cookies } from "next/headers";
import type { RegisterDto } from "@satoru-satoshi/summarize-api-sdk";

export async function POST(req: NextRequest) {
  const { authApi } = createServerSdk();

  const registerDto = (await req.json()) as RegisterDto;

  const resp = await authApi.register({ registerDto });

  const out = NextResponse.json(resp.data?.user ?? {}, { status: resp.status });

  await setTokensToCookies(resp.data?.tokens, cookies());

  return out;
}
