import { authApi, deleteTokensFromCookies } from "@/lib/api";
import { NextResponse } from "next/server";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  try {
    await authApi.logout();

    // Always delete tokens from cookies regardless of API response
    await deleteTokensFromCookies();

    // Redirect to login page after successful logout
    const url = new URL("/auth/login", req.url);
    return NextResponse.redirect(url);
  } catch (error) {
    console.error("Logout API error:", error);

    // Even if the API call fails, we should still clear local tokens
    await deleteTokensFromCookies();

    // Redirect to login page even if logout API fails
    const url = new URL("/auth/login", req.url);
    return NextResponse.redirect(url);
  }
}
