import React from "react";
import { act, render } from "@testing-library/react";
import ReadPage from "@tools/reader/pages/ReadPage";
import { readerApi } from "@tools/reader/api";
import type { IBook } from "@tools/reader/types";

/** What the reader shell mounted with; like the real one, it reads the start position once. */
const mockMounted: { mime: string; startPosition: unknown }[] = [];
function MockShell(props: { book: IBook; startPosition: unknown }) {
  const [initial] = React.useState(() => props.startPosition);
  React.useEffect(() => {
    mockMounted.push({ mime: props.book.mime, startPosition: initial });
  }, [initial, props.book.mime]);
  return null;
}
jest.mock("next/dynamic", () => () => MockShell);
jest.mock("@tools/reader/reading/useHighlights", () => ({
  useHighlights: () => ({ highlights: [], createHighlight: jest.fn(), updateHighlight: jest.fn(), deleteHighlight: jest.fn() }),
}));
jest.mock("@tools/reader/reading/useNotes", () => ({
  useNotes: () => ({ notes: [], createNote: jest.fn(), updateNote: jest.fn(), deleteNote: jest.fn() }),
}));
jest.mock("@tools/reader/api", () => ({
  readerApi: {
    documents: { setLastAccessed: jest.fn().mockResolvedValue({}), addSpentTime: jest.fn(), setReadingPosition: jest.fn() },
  },
}));
let mockBookQuery: { data?: IBook; isPending: boolean; error: Error | null } = { isPending: true, error: null };
jest.mock("@tools/reader/queries", () => ({
  useBook: () => mockBookQuery,
  useInvalidateReader: () => () => Promise.resolve(),
}));
jest.mock("next/navigation", () => ({ useParams: () => ({ id: "b1" }), useRouter: () => ({ back: jest.fn() }) }));

const book = (overrides: Partial<IBook>): IBook => ({
  id: "b1", title: "T", author: "A", fileUrl: "/api/gw/reader/documents/b1/download", spentTime: 0, pagePassCount: 0,
  isFinished: false, isFavorite: false, mime: "application/epub+zip", sizeBytes: "1", status: "ready",
  noteCount: 0, highlightCount: 0, lastAccessed: "2026-10-28T10:00:00Z", createdAt: "2026-10-25T00:00:00Z",
  updatedAt: "2026-10-28T10:00:00Z", ...overrides,
});

describe("ReadPage on a fresh load (the book query is pending first)", () => {
  beforeEach(() => {
    mockMounted.length = 0;
    mockBookQuery = { isPending: true, error: null };
    (readerApi.documents.setLastAccessed as jest.Mock).mockClear();
  });

  it("opens an EPUB at a position saved before Locator v2", async () => {
    const position = { type: "epub" as const, cfi: "epubcfi(/6/40!/4/2)", percentage: 63 };
    const view = render(<ReadPage />);
    expect(mockMounted).toHaveLength(0);

    mockBookQuery = { data: book({ readingPosition: position }), isPending: false, error: null };
    await act(async () => {
      view.rerender(<ReadPage />);
    });

    expect(mockMounted).toEqual([{ mime: "application/epub+zip", startPosition: position }]);
  });

  it("opens a PDF at its saved Locator v2", async () => {
    const position = { v: 2 as const, format: "pdf" as const, page: 41, totalProgression: 0.3 };
    const view = render(<ReadPage />);

    mockBookQuery = { data: book({ mime: "application/pdf", readingPosition: position }), isPending: false, error: null };
    await act(async () => {
      view.rerender(<ReadPage />);
    });

    expect(mockMounted).toEqual([{ mime: "application/pdf", startPosition: position }]);
  });

  it("records the visit only after loading the book, whose lastAccessed dates the server position", async () => {
    const view = render(<ReadPage />);
    await act(async () => {});
    expect(readerApi.documents.setLastAccessed).not.toHaveBeenCalled();

    mockBookQuery = { data: book({ readingPosition: null }), isPending: false, error: null };
    await act(async () => {
      view.rerender(<ReadPage />);
    });

    expect(readerApi.documents.setLastAccessed).toHaveBeenCalledTimes(1);
    expect(readerApi.documents.setLastAccessed).toHaveBeenCalledWith("b1");
    expect(mockMounted).toEqual([{ mime: "application/epub+zip", startPosition: null }]);
  });
});
