/**
 * @jest-environment node
 */
import { apiPath, proxyRequest, refreshTokens, tokenExpiry, RETRYABLE_BODY_BYTES, type ProxyDeps } from "@platform/api/proxy";

function jwt(exp: number): string {
  const b64 = (s: string) => Buffer.from(s).toString("base64url");
  return `${b64('{"alg":"HS256"}')}.${b64(JSON.stringify({ sub: "u", exp }))}.sig`;
}

const NOW = 1_800_000_000; // seconds
const live = jwt(NOW + 600);
const expiring = jwt(NOW + 10);

type Call = { url: string; init: RequestInit & { headers: Headers } };

/** A fake API: records calls, answers per URL, optionally rejects the first token. */
function fakeApi(opts: { reject?: string; responses?: Record<string, () => Response> } = {}) {
  const calls: Call[] = [];
  const fetchImpl = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    calls.push({ url, init: { ...init, headers } as Call["init"] });
    if (url.endsWith("/api/auth/refresh")) {
      return Response.json({ accessToken: "renewed", refreshToken: "r2" });
    }
    const auth = headers.get("authorization");
    if (opts.reject && auth === `Bearer ${opts.reject}`) {
      return Response.json({ message: "Unauthorized" }, { status: 401 });
    }
    const custom = opts.responses?.[url.replace(/\?.*$/, "")];
    if (custom) return custom();
    return Response.json({ ok: true, auth, url }, { headers: { "x-request-id": "req-1", "set-cookie": "leak=1", connection: "close" } });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

function deps(partial: Partial<ProxyDeps> & { fetchImpl: typeof fetch }): ProxyDeps & { tokens: unknown[]; cleared: number } {
  const state = { tokens: [] as unknown[], cleared: 0 };
  const d: ProxyDeps = {
    apiBase: "http://api:5173",
    accessToken: live,
    refreshToken: "r1",
    now: () => NOW * 1000,
    setTokens: async (t) => void state.tokens.push(t),
    clearTokens: async () => void state.cleared++,
    ...partial,
  };
  return Object.defineProperties(d, {
    tokens: { get: () => state.tokens },
    cleared: { get: () => state.cleared },
  }) as ProxyDeps & { tokens: unknown[]; cleared: number };
}

describe("proxy: path and token helpers", () => {
  it("joins and encodes segments, refuses traversal and empty parts", () => {
    expect(apiPath(["reader", "documents", "a b"])).toBe("reader/documents/a%20b");
    expect(() => apiPath([])).toThrow();
    expect(() => apiPath(["reader", ".."])).toThrow();
    expect(() => apiPath(["reader", ""])).toThrow();
    expect(() => apiPath(["re/ader"])).toThrow();
  });

  it("reads exp from a JWT without verifying it", () => {
    expect(tokenExpiry(live)).toBe(NOW + 600);
    expect(tokenExpiry("garbage")).toBeUndefined();
    expect(tokenExpiry(undefined)).toBeUndefined();
  });
});

describe("proxyRequest", () => {
  it("forwards method, path, query, headers and body with the bearer token; drops cookies and hop-by-hop headers", async () => {
    const api = fakeApi();
    const req = new Request("http://web/api/gw/reader/documents/favorite?x=1", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: "access_token=secret", connection: "keep-alive", "x-request-id": "abc" },
      body: JSON.stringify({ bookId: "b" }),
    });

    const res = await proxyRequest(req, ["reader", "documents", "favorite"], "?x=1", deps({ fetchImpl: api.fetchImpl }));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, auth: `Bearer ${live}`, url: "http://api:5173/api/reader/documents/favorite?x=1" });
    const [call] = api.calls;
    expect(call.init.method).toBe("POST");
    expect(call.init.headers.get("authorization")).toBe(`Bearer ${live}`);
    expect(call.init.headers.get("content-type")).toBe("application/json");
    expect(call.init.headers.get("x-request-id")).toBe("abc");
    expect(call.init.headers.has("cookie")).toBe(false);
    expect(call.init.headers.has("connection")).toBe(false);
    expect(Buffer.from(call.init.body as ArrayBuffer).toString()).toBe('{"bookId":"b"}');
  });

  it("strips set-cookie and hop-by-hop headers from the response and keeps the rest", async () => {
    const api = fakeApi();
    const res = await proxyRequest(new Request("http://web/api/gw/jobs"), ["jobs"], "", deps({ fetchImpl: api.fetchImpl }));
    expect(res.headers.get("x-request-id")).toBe("req-1");
    expect(res.headers.has("set-cookie")).toBe(false);
    expect(res.headers.has("connection")).toBe(false);
  });

  it("refreshes once and retries a small request after a 401", async () => {
    const api = fakeApi({ reject: live });
    const d = deps({ fetchImpl: api.fetchImpl });

    const res = await proxyRequest(new Request("http://web/api/gw/jobs", { method: "POST", body: "{}" }), ["jobs"], "", d);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ auth: "Bearer renewed" });
    expect(api.calls.map((c) => c.url)).toEqual(["http://api:5173/api/jobs", "http://api:5173/api/auth/refresh", "http://api:5173/api/jobs"]);
    expect(d.tokens).toEqual([{ accessToken: "renewed", refreshToken: "r2" }]);
  });

  it("refreshes proactively when the token is about to expire or missing", async () => {
    const api = fakeApi();
    await proxyRequest(new Request("http://web/api/gw/jobs"), ["jobs"], "", deps({ fetchImpl: api.fetchImpl, accessToken: expiring }));
    expect(api.calls.map((c) => c.url)).toEqual(["http://api:5173/api/auth/refresh", "http://api:5173/api/jobs"]);
    expect(api.calls[1].init.headers.get("authorization")).toBe("Bearer renewed");

    const api2 = fakeApi();
    await proxyRequest(new Request("http://web/api/gw/jobs"), ["jobs"], "", deps({ fetchImpl: api2.fetchImpl, accessToken: undefined }));
    expect(api2.calls[0].url).toMatch(/auth\/refresh$/);
  });

  it("passes a 401 through when there is no refresh token, and clears cookies when the refresh is rejected", async () => {
    const api = fakeApi({ reject: live });
    const res = await proxyRequest(new Request("http://web/api/gw/jobs"), ["jobs"], "", deps({ fetchImpl: api.fetchImpl, refreshToken: undefined }));
    expect(res.status).toBe(401);
    expect(api.calls).toHaveLength(1);

    const rejecting = jest.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith("/auth/refresh") ? Response.json({ message: "nope" }, { status: 401 }) : Response.json({}, { status: 401 }),
    ) as unknown as typeof fetch;
    const d = deps({ fetchImpl: rejecting });
    const res2 = await proxyRequest(new Request("http://web/api/gw/jobs"), ["jobs"], "", d);
    expect(res2.status).toBe(401);
    expect(d.cleared).toBe(1);
  });

  it("streams a large body once (no retry) and keeps the upstream status", async () => {
    const api = fakeApi({ reject: live });
    const big = new Uint8Array(RETRYABLE_BODY_BYTES + 1);
    const req = new Request("http://web/api/gw/reader/documents/upload", {
      method: "POST",
      headers: { "content-length": String(big.byteLength), "content-type": "multipart/form-data; boundary=x" },
      body: big,
    });

    const res = await proxyRequest(req, ["reader", "documents", "upload"], "", deps({ fetchImpl: api.fetchImpl }));

    expect(res.status).toBe(401);
    expect(api.calls).toHaveLength(1);
    expect((api.calls[0].init as { duplex?: string }).duplex).toBe("half");
  });

  it("passes binary responses and errors through unchanged", async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x00, 0xff]);
    const api = fakeApi({
      responses: {
        "http://api:5173/api/reader/documents/b/download": () =>
          new Response(bytes, { status: 200, headers: { "content-type": "application/pdf", "content-disposition": 'attachment; filename="a.pdf"' } }),
        "http://api:5173/api/reader/documents/missing": () => Response.json({ message: "Book not found" }, { status: 404 }),
      },
    });
    const file = await proxyRequest(new Request("http://web/x"), ["reader", "documents", "b", "download"], "", deps({ fetchImpl: api.fetchImpl }));
    expect(file.headers.get("content-type")).toBe("application/pdf");
    expect(file.headers.get("content-disposition")).toContain("a.pdf");
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(bytes);

    const missing = await proxyRequest(new Request("http://web/x"), ["reader", "documents", "missing"], "", deps({ fetchImpl: api.fetchImpl }));
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ message: "Book not found" });
  });

  it("rejects a bad path without calling the API", async () => {
    const api = fakeApi();
    const res = await proxyRequest(new Request("http://web/x"), ["..", "etc"], "", deps({ fetchImpl: api.fetchImpl }));
    expect(res.status).toBe(400);
    expect(api.calls).toHaveLength(0);
  });
});

describe("refresh single flight", () => {
  it("shares one refresh between concurrent requests that hold the same (rotated) refresh token", async () => {
    const api = fakeApi();
    const d = deps({ fetchImpl: api.fetchImpl, accessToken: expiring, refreshToken: "shared" });

    const [a, b, c] = await Promise.all([
      proxyRequest(new Request("http://web/api/gw/jobs"), ["jobs"], "", d),
      proxyRequest(new Request("http://web/api/gw/reader/documents"), ["reader", "documents"], "", d),
      refreshTokens(d, api.fetchImpl),
    ]);

    expect([a.status, b.status]).toEqual([200, 200]);
    expect(c?.accessToken).toBe("renewed");
    expect(api.calls.filter((call) => call.url.endsWith("/auth/refresh"))).toHaveLength(1);
    // one exchange, but every caller stores the pair in its own response
    expect(d.tokens).toHaveLength(3);
    // the next refresh with a different token runs on its own
    await refreshTokens({ ...d, refreshToken: "other" }, api.fetchImpl);
    expect(api.calls.filter((call) => call.url.endsWith("/auth/refresh"))).toHaveLength(2);
  });
});
