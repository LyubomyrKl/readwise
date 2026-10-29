/**
 * The four auth calls go to the web app's own routes (app/api/auth/*), which
 * talk to the API and set the httpOnly session cookies. Everything else goes
 * through the proxy (see http.ts).
 */

import { ApiError } from "./http";
import type { AuthenticationResponseJSON, PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import type { LoginDto, RegisterDto, SafeUser } from "./types";

async function post<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const data: unknown = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    const m = data && typeof data === "object" ? (data as { message?: unknown; error?: unknown }) : {};
    const message = (Array.isArray(m.message) ? m.message.join(", ") : m.message) ?? m.error;
    throw new ApiError(response.status, typeof message === "string" && message ? message : `Request failed (${response.status})`, data);
  }
  return data as T;
}

export const authApi = {
  login: (dto: LoginDto) => post<{ user: SafeUser }>("/api/auth/login", dto),
  register: (dto: RegisterDto) => post<SafeUser>("/api/auth/register", dto),
  refresh: () => post<{ ok: true }>("/api/auth/refresh"),
  logout: () => post<{ redirectTo: string }>("/api/auth/logout"),
  /** ends every session of the user, on every device */
  logoutAll: () => post<{ redirectTo: string }>("/api/auth/logout", { everywhere: true }),
  passkeyOptions: (email?: string) =>
    post<PublicKeyCredentialRequestOptionsJSON>("/api/auth/passkey/options", email ? { email } : {}),
  passkeyLogin: (response: AuthenticationResponseJSON) =>
    post<{ user: SafeUser }>("/api/auth/passkey/login", { response }),
};
