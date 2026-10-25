import { readerApi, withBrowserUrls } from "@tools/reader/api";
import type { BookResponse } from "@tools/reader/types";

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

const book = (overrides: Partial<BookResponse> = {}): BookResponse => ({
  id: "b1",
  title: "T",
  author: "A",
  fileUrl: "/reader/documents/b1/download",
  coverUrl: "/reader/documents/b1/cover",
  spentTime: 0,
  pagePassCount: 0,
  isFinished: false,
  isFavorite: false,
  mime: "application/pdf",
  sizeBytes: "1",
  status: "ready",
  hasExtraction: false,
  noteCount: 0,
  highlightCount: 0,
  createdAt: "2026-10-25T00:00:00Z",
  updatedAt: "2026-10-25T00:00:00Z",
  ...overrides,
});

describe("readerApi", () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("prefixes the API's file paths with the proxy path", () => {
    expect(withBrowserUrls(book())).toMatchObject({ fileUrl: "/api/gw/reader/documents/b1/download", coverUrl: "/api/gw/reader/documents/b1/cover" });
    expect(withBrowserUrls(book({ coverUrl: undefined })).coverUrl).toBeUndefined();
    expect(readerApi.documents.uploadUrl).toBe("/api/gw/reader/documents/upload");
  });

  it("lists documents through the proxy and maps their URLs", async () => {
    fetchMock.mockResolvedValue(res(200, [book()]));
    const [first] = await readerApi.documents.list();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/gw/reader/documents");
    expect(first.fileUrl).toBe("/api/gw/reader/documents/b1/download");
  });

  it("targets the reader endpoints with the right methods", async () => {
    fetchMock.mockResolvedValue(res(200, {}));
    await readerApi.summaries.create("b1", { summaryType: "abstractive", summarizationStrategy: "two_pass" });
    await readerApi.summaries.listAll({ latestPerBook: true });
    await readerApi.reading.updateNote("n1", { isPinned: true });
    await readerApi.documents.delete("b 1");

    const calls = fetchMock.mock.calls.map(([url, init]: [string, RequestInit]) => [init.method ?? "GET", url]);
    expect(calls).toEqual([
      ["POST", "/api/gw/reader/documents/b1/summaries"],
      ["GET", "/api/gw/reader/summaries?latestPerBook=true"],
      ["PATCH", "/api/gw/reader/notes/n1"],
      ["DELETE", "/api/gw/reader/documents/b%201"],
    ]);
  });
});
