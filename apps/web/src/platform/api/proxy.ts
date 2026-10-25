/**
 * The generic authenticated proxy behind /api/gw/<path>.
 *
 * Forwards method, path, query, headers (minus cookies and hop-by-hop headers)
 * and body to `${apiBase}/api/<path>`, injects `Authorization` from the access
 * token cookie, refreshes the token through the cookie flow when it is about
 * to expire or when the API answers 401, and streams the response back.
 * Pure with respect to Next.js: the route handler supplies the cookie access.
 */

import type { Tokens } from "./types";

export interface ProxyDeps {
  /** API origin, e.g. http://api:5173 */
  apiBase: string;
  accessToken?: string;
  refreshToken?: string;
  setTokens(tokens: Tokens): Promise<void>;
  clearTokens(): Promise<void>;
  fetchImpl?: typeof fetch;
  /** seconds before expiry at which the access token is refreshed proactively */
  refreshSkewSeconds?: number;
  now?: () => number;
}

/** Bodies up to this size are buffered so a request can be retried after a token refresh. */
export const RETRYABLE_BODY_BYTES = 1024 * 1024;

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

/** Request headers that must not travel to the API. */
const REQUEST_DROP = new Set([...HOP_BY_HOP, "cookie", "host", "authorization", "content-length", "expect"]);

/** Response headers that must not travel back to the browser. */
const RESPONSE_DROP = new Set([...HOP_BY_HOP, "set-cookie", "set-cookie2"]);

export class ProxyPathError extends Error {}

/** Validates the path segments and joins them into the API path. */
export function apiPath(segments: readonly string[]): string {
  if (segments.length === 0) throw new ProxyPathError("empty path");
  for (const segment of segments) {
    if (!segment || segment === "." || segment === ".." || segment.includes("/") || segment.includes("\\")) {
      throw new ProxyPathError(`invalid path segment: ${segment}`);
    }
  }
  return segments.map(encodeURIComponent).join("/");
}

/** `exp` (seconds since epoch) of a JWT, without verifying it; undefined when unreadable. */
export function tokenExpiry(token: string | undefined): number | undefined {
  if (!token) return undefined;
  const parts = token.split(".");
  if (parts.length !== 3) return undefined;
  try {
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8")) as {
      exp?: unknown;
    };
    return typeof payload.exp === "number" ? payload.exp : undefined;
  } catch {
    return undefined;
  }
}

function forwardHeaders(incoming: Headers, accessToken: string | undefined): Headers {
  const headers = new Headers();
  incoming.forEach((value, key) => {
    if (!REQUEST_DROP.has(key.toLowerCase())) headers.set(key, value);
  });
  if (accessToken) headers.set("authorization", `Bearer ${accessToken}`);
  return headers;
}

function responseHeaders(upstream: Headers): Headers {
  const headers = new Headers();
  const encoded = upstream.has("content-encoding");
  upstream.forEach((value, key) => {
    const k = key.toLowerCase();
    if (RESPONSE_DROP.has(k)) return;
    // fetch already decoded the body; the length and encoding no longer describe it
    if (encoded && (k === "content-encoding" || k === "content-length")) return;
    headers.append(key, value);
  });
  return headers;
}

async function refresh(deps: ProxyDeps, fetchImpl: typeof fetch): Promise<string | undefined> {
  if (!deps.refreshToken) return undefined;
  try {
    const response = await fetchImpl(`${deps.apiBase}/api/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: deps.refreshToken }),
    });
    if (!response.ok) {
      if (response.status === 401) await deps.clearTokens();
      return undefined;
    }
    const tokens = (await response.json()) as Tokens;
    if (!tokens?.accessToken) return undefined;
    await deps.setTokens(tokens);
    return tokens.accessToken;
  } catch {
    return undefined;
  }
}

/**
 * Proxies one request. `segments` is the path after /api/gw/, `search` the raw query string ("?a=b" or "").
 */
export async function proxyRequest(
  request: Request,
  segments: readonly string[],
  search: string,
  deps: ProxyDeps,
): Promise<Response> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  let path: string;
  try {
    path = apiPath(segments);
  } catch (error) {
    return Response.json({ message: (error as Error).message }, { status: 400 });
  }
  const url = `${deps.apiBase}/api/${path}${search}`;
  const method = request.method.toUpperCase();
  const hasBody = !["GET", "HEAD"].includes(method) && request.body !== null;

  // A small body is buffered so the request can be replayed after a refresh; a large one streams once.
  let body: BodyInit | null = null;
  let replayable = true;
  if (hasBody) {
    const declared = Number(request.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > RETRYABLE_BODY_BYTES) {
      body = request.body;
      replayable = false;
    } else {
      const buffer = await request.arrayBuffer();
      body = buffer;
      replayable = buffer.byteLength <= RETRYABLE_BODY_BYTES;
    }
  }

  // Proactive refresh: an access token about to expire (or missing) is renewed before the call.
  let accessToken = deps.accessToken;
  const now = (deps.now ?? Date.now)() / 1000;
  const exp = tokenExpiry(accessToken);
  const skew = deps.refreshSkewSeconds ?? 30;
  if ((!accessToken || (exp !== undefined && exp - now < skew)) && deps.refreshToken) {
    accessToken = (await refresh(deps, fetchImpl)) ?? accessToken;
  }

  const send = (token: string | undefined): Promise<Response> =>
    fetchImpl(url, {
      method,
      headers: forwardHeaders(request.headers, token),
      body,
      redirect: "manual",
      // streaming request bodies need half duplex in Node
      ...(body && typeof body === "object" && "getReader" in body ? { duplex: "half" } : {}),
    } as RequestInit);

  let upstream = await send(accessToken);

  if (upstream.status === 401 && replayable && deps.refreshToken) {
    const renewed = await refresh(deps, fetchImpl);
    if (renewed) {
      upstream = await send(renewed);
    }
  }

  return new Response(upstream.status === 204 || upstream.status === 304 ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders(upstream.headers),
  });
}
