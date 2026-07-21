import { authApi, deleteTokensFromCookies } from "@/lib/api";
import { NextResponse } from "next/server";

export async function POST() {
  try {
    await authApi.logout();
  } catch (error) {
    console.error("Logout API error:", error);
  }

  // Always clear tokens and return redirect URL
  await deleteTokensFromCookies();
  return NextResponse.json({ redirectTo: "/auth/login" });
}
