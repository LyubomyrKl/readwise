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
  /** the browser's X-Forwarded-For (set by Caddy), passed on to the refresh call: the API rate-limits it by client */
  forwardedFor?: string;
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

/**
 * The client address for a call the web app makes on the browser's behalf. The
 * API keys its rate limits for anonymous calls by it; without it every visitor
 * would share the web container's budget.
 */
export function forwardedFor(headers: Headers): Record<string, string> {
  const value = headers.get("x-forwarded-for");
  return value ? { "x-forwarded-for": value } : {};
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

/**
 * Refreshes in flight, keyed by refresh token. The API rotates the refresh
 * token on every use, so concurrent requests holding the same token share one
 * exchange instead of racing (the second would be rejected). The exchange is
 * shared; storing the cookies is not: every caller writes the new pair into
 * its own response, so whichever response reaches the browser first carries
 * the rotated token.
 */
type RefreshOutcome = { status: "ok"; tokens: Tokens } | { status: "rejected" } | { status: "failed" };
const inflight = new Map<string, Promise<RefreshOutcome>>();

/**
 * Exchanges that finished within the last minute, by the refresh token they
 * spent. A request that left the browser with the old token before the new
 * pair arrived (a slow upload, a poller) gets that pair too, instead of a
 * rejection that would sign the user out: the API revoked the old token.
 */
export const ROTATION_GRACE_MS = 60_000;
const recent = new Map<string, { tokens: Tokens; at: number }>();

/** Forgets the finished exchange of one refresh token (on logout), or all of them (tests). */
export function forgetRefreshes(token?: string): void {
  if (token === undefined) recent.clear();
  else recent.delete(token);
}

function exchange(apiBase: string, token: string, fetchImpl: typeof fetch, forwarded?: string): Promise<RefreshOutcome> {
  const done = recent.get(token);
  if (done && Date.now() - done.at < ROTATION_GRACE_MS) return Promise.resolve({ status: "ok", tokens: done.tokens });
  const existing = inflight.get(token);
  if (existing) return existing;
  const run = (async (): Promise<RefreshOutcome> => {
    try {
      const response = await fetchImpl(`${apiBase}/api/auth/refresh`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(forwarded ? { "x-forwarded-for": forwarded } : {}) },
        body: JSON.stringify({ refreshToken: token }),
      });
      if (!response.ok) return { status: response.status === 401 ? "rejected" : "failed" };
      const tokens = (await response.json()) as Tokens;
      if (!tokens?.accessToken) return { status: "failed" };
      const now = Date.now();
      for (const [key, entry] of recent) if (now - entry.at >= ROTATION_GRACE_MS) recent.delete(key);
      recent.set(token, { tokens, at: now });
      return { status: "ok", tokens };
    } catch {
      return { status: "failed" };
    } finally {
      inflight.delete(token);
    }
  })();
  inflight.set(token, run);
  return run;
}

/** Exchanges the refresh token for a new pair and stores it; undefined when the session is gone. */
export async function refreshTokens(deps: ProxyDeps, fetchImpl: typeof fetch = fetch): Promise<Tokens | undefined> {
  const token = deps.refreshToken;
  if (!token) return undefined;
  const outcome = await exchange(deps.apiBase, token, fetchImpl, deps.forwardedFor);
  if (outcome.status === "ok") {
    await deps.setTokens(outcome.tokens);
    return outcome.tokens;
  }
  if (outcome.status === "rejected") await deps.clearTokens();
  return undefined;
}

async function refresh(deps: ProxyDeps, fetchImpl: typeof fetch): Promise<string | undefined> {
  return (await refreshTokens(deps, fetchImpl))?.accessToken;
}

/** The whole body when it fits in `limit` bytes; else a stream of what was read followed by the rest. */
async function readUpTo(
  source: ReadableStream<Uint8Array>,
  limit: number,
): Promise<{ buffered: Uint8Array<ArrayBuffer> } | { stream: ReadableStream<Uint8Array> }> {
  const reader = source.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      const buffered = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        buffered.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return { buffered };
    }
    chunks.push(value);
    size += value.byteLength;
    if (size > limit) break;
  }
  return {
    stream: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
      },
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) controller.close();
        else controller.enqueue(value);
      },
      cancel(reason) {
        return reader.cancel(reason);
      },
    }),
  };
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

  // A small body is buffered so the request can be replayed after a refresh; a large one streams
  // once. At most RETRYABLE_BODY_BYTES are ever held here, whatever Content-Length says (or not).
  let body: BodyInit | null = null;
  let replayable = true;
  if (hasBody && request.body) {
    const declared = Number(request.headers.get("content-length") ?? NaN);
    const read = Number.isFinite(declared) && declared > RETRYABLE_BODY_BYTES ? { stream: request.body } : await readUpTo(request.body, RETRYABLE_BODY_BYTES);
    if ("buffered" in read) {
      body = read.buffered;
    } else {
      body = read.stream;
      replayable = false;
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
