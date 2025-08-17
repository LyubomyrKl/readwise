import { NextRequest, NextResponse } from "next/server";
import { registerReqSchema } from "../schemas";
import { appendSetCookies, createServerSdk } from "@/lib/sdk";

export async function POST(req: NextRequest) {
  const { authApi } = createServerSdk(req);

  const registerDto = registerReqSchema.parse(await req.json());

  const resp = await authApi.register({ registerDto });

  const out = NextResponse.json(resp.data?.user ?? {}, { status: resp.status });

  appendSetCookies(resp, out.headers);

  return out;
}
