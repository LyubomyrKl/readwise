import { authApi, setTokensToCookies, axios } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const refreshToken = req.cookies.get("refresh_token")?.value;

  if (!refreshToken) {
    return NextResponse.json({ error: "No refresh token" }, { status: 401 });
  }

  try {
    const resp = await authApi.refresh({ refreshToken });

    if (resp.data) {
      await setTokensToCookies(resp.data);
    }

    return NextResponse.json(resp.data ?? {}, { status: resp.status });
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      return NextResponse.json(error.response.data, {
        status: error.response.status,
      });
    }
    return NextResponse.json({ error: "Refresh failed" }, { status: 500 });
  }
}
