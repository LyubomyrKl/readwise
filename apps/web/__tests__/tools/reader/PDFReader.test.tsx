import { act, render } from "@testing-library/react";
import PDFReader from "@tools/reader/reading/PDFReader";
import type { IBook } from "@tools/reader/types";

// The viewer itself (pdfium in WebAssembly) is out of scope: only the file download is tested.
jest.mock("@embedpdf/engines/react", () => ({ usePdfiumEngine: () => ({ engine: {}, isLoading: false, error: null }) }));
jest.mock("@embedpdf/core", () => ({ createPluginRegistration: jest.fn(() => ({})) }));
jest.mock("@embedpdf/core/react", () => ({ EmbedPDF: () => null }));
jest.mock("@embedpdf/plugin-viewport", () => ({ ViewportPluginPackage: {} }));
jest.mock("@embedpdf/plugin-viewport/react", () => ({ Viewport: () => null }));
jest.mock("@embedpdf/plugin-scroll", () => ({ ScrollPluginPackage: {} }));
jest.mock("@embedpdf/plugin-scroll/react", () => ({ Scroller: () => null, useScroll: () => ({ state: null }) }));
jest.mock("@embedpdf/plugin-loader", () => ({ LoaderPluginPackage: {} }));
jest.mock("@embedpdf/plugin-render", () => ({ RenderPluginPackage: {} }));
jest.mock("@embedpdf/plugin-render/react", () => ({ RenderLayer: () => null }));
jest.mock("@embedpdf/plugin-zoom", () => ({ ZoomPluginPackage: {} }));
jest.mock("@embedpdf/plugin-zoom/react", () => ({ useZoom: () => ({ provides: null, state: null }) }));

const book: IBook = {
  id: "b1", title: "Paper", author: "A", fileUrl: "/api/gw/reader/documents/b1/download", spentTime: 0, pagePassCount: 0,
  isFinished: false, isFavorite: false, mime: "application/pdf", sizeBytes: "1", status: "ready", hasExtraction: false,
  noteCount: 0, highlightCount: 0, createdAt: "2026-10-25T00:00:00Z", updatedAt: "2026-10-25T00:00:00Z",
};

describe("PDFReader file download", () => {
  let finishDownload: () => void;
  const createObjectURL = jest.fn(() => "blob:pdf-1");
  const revokeObjectURL = jest.fn();

  beforeAll(() => {
    // not in jsdom
    Object.assign(URL, { createObjectURL, revokeObjectURL });
  });
  beforeEach(() => {
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    global.fetch = jest.fn(
      () =>
        new Promise((resolve) => {
          finishDownload = () => resolve({ ok: true, blob: async () => new Blob(["%PDF"]) });
        })
    ) as unknown as typeof fetch;
  });

  it("makes no blob URL when it unmounts before the download finishes", async () => {
    const view = render(<PDFReader book={book} />);
    view.unmount();
    await act(async () => finishDownload());

    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("revokes its blob URL on unmount", async () => {
    const view = render(<PDFReader book={book} />);
    await act(async () => finishDownload());
    expect(createObjectURL).toHaveBeenCalledTimes(1);

    view.unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:pdf-1");
  });
});
