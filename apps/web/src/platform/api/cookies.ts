// Server-side only: next/headers has no browser build.
import { cookies } from "next/headers";
import type { Tokens } from "./types";

/** The two httpOnly cookies that hold the API tokens (set by the auth routes, read by the proxy). */
export const ACCESS_COOKIE = "access_token";
export const REFRESH_COOKIE = "refresh_token";

const base = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

export async function setTokensToCookies(tokens: Tokens): Promise<void> {
  const store = await cookies();
  // lifetimes match the API's JWT TTLs (15 minutes, 7 days)
  store.set(ACCESS_COOKIE, tokens.accessToken, { ...base, maxAge: 15 * 60 });
  store.set(REFRESH_COOKIE, tokens.refreshToken, { ...base, maxAge: 7 * 24 * 60 * 60 });
}

export async function deleteTokensFromCookies(): Promise<void> {
  const store = await cookies();
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
}

export async function readTokens(): Promise<{ accessToken?: string; refreshToken?: string }> {
  const store = await cookies();
  return {
    accessToken: store.get(ACCESS_COOKIE)?.value,
    refreshToken: store.get(REFRESH_COOKIE)?.value,
  };
}

/** Origin of the API as seen from the web server (Compose: http://api:5173). */
export function apiBaseUrl(): string {
  return (process.env.API_URL || "http://localhost:5173").replace(/\/$/, "");
}
