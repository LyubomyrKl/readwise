import { createServerSdk, setTokensToCookies } from "@/lib/sdk";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { authApi } = createServerSdk();
  const resp = await authApi.login({ loginDto: body }); // AxiosResponse
  const out = NextResponse.json(resp.data, { status: resp.status });

  await setTokensToCookies(resp.data.tokens, cookies());

  console.log((await cookies()).get("access_token"));

  return out;
}
