import { appendSetCookies, createServerSdk } from "@/lib/sdk";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { axios } = createServerSdk(req);
  const resp = await axios.post("/auth/refresh", {});
  const out = NextResponse.json(resp.data ?? {}, { status: resp.status });
  appendSetCookies(resp, out.headers);
  return out;
}
