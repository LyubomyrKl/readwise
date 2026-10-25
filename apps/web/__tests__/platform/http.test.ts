import { ApiError, apiFetch, apiUrl, browserNavigation, sendBeaconJson, toQueryString } from "@platform/api/http";

/** jsdom has no Response; this is the subset apiFetch reads. */
function res(status: number, body?: unknown): Response {
  const text = body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body);
  const r = {
    status,
    ok: status >= 200 && status < 300,
    text: async () => text,
    json: async () => JSON.parse(text) as unknown,
    clone: () => r,
  };
  return r as unknown as Response;
}

describe("apiFetch", () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("builds proxy URLs with query strings", () => {
    expect(apiUrl("/reader/documents")).toBe("/api/gw/reader/documents");
    expect(apiUrl("jobs", { limit: 5, status: undefined, latestPerBook: true })).toBe("/api/gw/jobs?limit=5&latestPerBook=true");
    expect(toQueryString({})).toBe("");
  });

  it("sends JSON with credentials and parses the answer", async () => {
    fetchMock.mockResolvedValue(res(201, { id: "j1" }));

    const result = await apiFetch<{ id: string }>("/jobs/j1/cancel", { method: "POST", json: { why: "x" } });

    expect(result).toEqual({ id: "j1" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/gw/jobs/j1/cancel");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
    expect(init.body).toBe('{"why":"x"}');
  });

  it("returns undefined for 204 and throws ApiError with the API's message otherwise", async () => {
    fetchMock.mockResolvedValueOnce(res(204));
    await expect(apiFetch("/x")).resolves.toBeUndefined();

    fetchMock.mockResolvedValueOnce(res(400, { message: ["bookId must be a string"], statusCode: 400 }));
    await expect(apiFetch("/x")).rejects.toMatchObject({ name: "ApiError", status: 400, message: "bookId must be a string" });

    fetchMock.mockResolvedValueOnce(res(502, "nope"));
    await expect(apiFetch("/x")).rejects.toBeInstanceOf(ApiError);
  });

  it("sends the user to the login page when the session is gone", async () => {
    fetchMock.mockResolvedValueOnce(res(401, { message: "Unauthorized" }));
    const assign = jest.spyOn(browserNavigation, "assign").mockImplementation(() => {});
    window.history.pushState({}, "", "/apps/reader?q=1");

    await expect(apiFetch("/reader/documents")).rejects.toMatchObject({ status: 401 });
    expect(assign).toHaveBeenCalledWith("/auth/login?next=%2Fapps%2Freader%3Fq%3D1");
    assign.mockRestore();
  });

  it("sendBeaconJson posts a JSON blob to the proxy path", () => {
    const sendBeacon = jest.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: sendBeacon });

    expect(sendBeaconJson("/reader/documents/time-spent", { bookId: "b", amount: 0.1 })).toBe(true);
    const [url, blob] = sendBeacon.mock.calls[0] as [string, Blob];
    expect(url).toBe("/api/gw/reader/documents/time-spent");
    expect(blob.type).toBe("application/json");
  });
});
