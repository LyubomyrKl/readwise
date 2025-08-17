import { NextRequest, NextResponse } from "next/server";
import { registerReqSchema } from "../schemas";
import { setTokensToCookies, createServerSdk } from "@/lib/sdk";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  const { authApi } = createServerSdk();

  const registerDto = registerReqSchema.parse(await req.json());

  const resp = await authApi.register({ registerDto });

  const out = NextResponse.json(resp.data?.user ?? {}, { status: resp.status });

  await setTokensToCookies(resp.data?.tokens, cookies());

  return out;
}
