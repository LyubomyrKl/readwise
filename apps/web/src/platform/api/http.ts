/**
 * Browser-side HTTP client. Every call goes through the proxy at /api/gw, which
 * adds the session and refreshes it; a 401 that still comes back means the
 * session is gone, and the user is sent to the login page.
 */

import { PLATFORM_ROUTES } from "@platform/routes";

export const PROXY_PREFIX = "/api/gw";

export type Query = Record<string, string | number | boolean | undefined | null>;

export interface ApiRequestInit extends Omit<RequestInit, "body"> {
  /** JSON-encoded body; sets the content type */
  json?: unknown;
  /** raw body (FormData, Blob, string) */
  body?: BodyInit | null;
  query?: Query;
}

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/** Absolute browser URL for an API path, e.g. apiUrl("/reader/documents/1/download"). */
export function apiUrl(path: string, query?: Query): string {
  const qs = query ? toQueryString(query) : "";
  return `${PROXY_PREFIX}${path.startsWith("/") ? path : `/${path}`}${qs}`;
}

export function toQueryString(query: Query): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    params.set(key, String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

async function messageOf(response: Response): Promise<{ message: string; body: unknown }> {
  const fallback = `Request failed with status code ${response.status}`;
  try {
    const body: unknown = await response.clone().json();
    if (body && typeof body === "object") {
      const m = (body as { message?: unknown; error?: unknown }).message ?? (body as { error?: unknown }).error;
      if (Array.isArray(m)) return { message: m.join(", "), body };
      if (typeof m === "string" && m) return { message: m, body };
    }
    return { message: fallback, body };
  } catch {
    return { message: fallback, body: undefined };
  }
}

/** Full-page navigation; a seam so tests can observe the redirect. */
export const browserNavigation = {
  assign(url: string): void {
    window.location.assign(url);
  },
};

function sendToLogin(): void {
  if (typeof window === "undefined") return;
  const current = window.location.pathname + window.location.search;
  browserNavigation.assign(`${PLATFORM_ROUTES.auth.login}?next=${encodeURIComponent(current)}`);
}

/** Calls the API through the proxy and returns the parsed JSON (undefined for 204). */
export async function apiFetch<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
  const { json, query, headers, body, ...rest } = init;
  const finalHeaders = new Headers(headers);
  let finalBody: BodyInit | null | undefined = body;
  if (json !== undefined) {
    finalHeaders.set("content-type", "application/json");
    finalBody = JSON.stringify(json);
  }
  const response = await fetch(apiUrl(path, query), {
    credentials: "include",
    ...rest,
    headers: finalHeaders,
    body: finalBody,
  });

  if (response.status === 204) return undefined as T;

  if (response.status === 401) {
    sendToLogin();
    throw new ApiError(401, "Unauthorized");
  }

  if (!response.ok) {
    const { message, body: errorBody } = await messageOf(response);
    throw new ApiError(response.status, message, errorBody);
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Fire-and-forget JSON POST that survives page unload. */
export function sendBeaconJson(path: string, payload: unknown): boolean {
  if (typeof navigator === "undefined" || !navigator.sendBeacon) return false;
  const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
  return navigator.sendBeacon(apiUrl(path), blob);
}
