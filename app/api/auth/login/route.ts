import { appendSetCookies, createServerSdk } from "@/lib/sdk";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { authApi } = createServerSdk(req);
  const resp = await authApi.login({ loginDto: body }); // AxiosResponse
  const out = NextResponse.json(resp.data, { status: resp.status });
  appendSetCookies(resp, out.headers);
  return out;
}
