// app/api/auth/logout/route.ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authApi } from "@/lib/sdk";
import { clearAuthCookies } from "@/lib/cookies";

export async function POST() {
  const at = (await cookies()).get("access_token")?.value;
  try {
    if (at) {
      await authApi.logout({
        headers: { Authorization: `Bearer ${at}` },
      });
    }
  } finally {
    const res = new NextResponse(null, { status: 204 });
    clearAuthCookies(res);
    return res;
  }
}
