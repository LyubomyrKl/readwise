import { act, render } from "@testing-library/react";
import EPUBReader from "@tools/reader/reading/EPUBReader";
import type { IBook, ReadingPosition } from "@tools/reader/types";

/** Props the (dynamically loaded) ReactReader received, newest last. */
const mockReaderProps: { location: string | null; locationChanged: (cfi: string) => void }[] = [];
jest.mock("next/dynamic", () => () =>
  function FakeReactReader(props: { location: string | null; locationChanged: (cfi: string) => void }) {
    mockReaderProps.push(props);
    return null;
  }
);

const SERVER_CFI = "epubcfi(/6/40!/4/2)";
const LOCAL_CFI = "epubcfi(/6/12!/4/2)";
const serverPosition: ReadingPosition = { type: "epub", cfi: SERVER_CFI, percentage: 63 };

const book = (overrides: Partial<IBook> = {}): IBook => ({
  id: "b1", title: "T", author: "A", fileUrl: "/api/gw/reader/documents/b1/download", spentTime: 0, pagePassCount: 0,
  isFinished: false, isFavorite: false, mime: "application/epub+zip", sizeBytes: "1", status: "ready", hasExtraction: false,
  noteCount: 0, highlightCount: 0, lastAccessed: "2026-10-28T10:00:00.000Z", createdAt: "2026-10-25T00:00:00Z",
  updatedAt: "2026-10-28T10:00:00Z", ...overrides,
});

/** Renders the reader and returns the location the ReactReader opened at (after the EPUB "downloaded"). */
async function openedAt(props: { book: IBook; initialPosition?: ReadingPosition | null }) {
  render(<EPUBReader {...props} />);
  await act(async () => {});
  return mockReaderProps[0]?.location;
}

describe("EPUBReader start location", () => {
  beforeEach(() => {
    mockReaderProps.length = 0;
    localStorage.clear();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }) as unknown as typeof fetch;
  });

  it("opens at the server position over an older spot cached on this device", async () => {
    localStorage.setItem("epub.cfi.b1", JSON.stringify({ cfi: LOCAL_CFI, at: Date.parse("2026-10-27T09:00:00Z") }));
    expect(await openedAt({ book: book(), initialPosition: serverPosition })).toBe(SERVER_CFI);
  });

  it("opens at a cached spot newer than the server's last save (pages turned offline)", async () => {
    localStorage.setItem("epub.cfi.b1", JSON.stringify({ cfi: LOCAL_CFI, at: Date.parse("2026-10-28T11:00:00Z") }));
    expect(await openedAt({ book: book(), initialPosition: serverPosition })).toBe(LOCAL_CFI);
  });

  it("treats an undated CFI cached by an older build as older than the server position", async () => {
    localStorage.setItem("epub.cfi.b1", LOCAL_CFI);
    expect(await openedAt({ book: book(), initialPosition: serverPosition })).toBe(SERVER_CFI);
  });

  it("falls back to the cached spot, dated or not, when the server has no position", async () => {
    localStorage.setItem("epub.cfi.b1", LOCAL_CFI);
    expect(await openedAt({ book: book(), initialPosition: null })).toBe(LOCAL_CFI);
  });

  it("opens at the start without either", async () => {
    expect(await openedAt({ book: book(), initialPosition: null })).toBeNull();
  });

  it("caches each new location with its date", async () => {
    await openedAt({ book: book(), initialPosition: serverPosition });
    const before = Date.now();
    act(() => mockReaderProps[mockReaderProps.length - 1].locationChanged(LOCAL_CFI));

    const cached = JSON.parse(localStorage.getItem("epub.cfi.b1")!);
    expect(cached.cfi).toBe(LOCAL_CFI);
    expect(cached.at).toBeGreaterThanOrEqual(before);
  });
});
