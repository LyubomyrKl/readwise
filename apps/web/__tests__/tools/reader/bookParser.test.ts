import { extractBookMetadata } from "@tools/reader/documents/bookParser";

const mockLoadingTask = { promise: Promise.resolve({}), destroy: jest.fn(() => Promise.resolve()) };
jest.mock("pdfjs-dist", () => ({ GlobalWorkerOptions: {}, getDocument: jest.fn(() => mockLoadingTask) }));
jest.mock("epubjs", () => jest.fn());

/** A PDF upload; arrayBuffer() is all the parser reads. */
const pdfFile = () =>
  ({ name: "paper.pdf", type: "application/pdf", arrayBuffer: async () => new ArrayBuffer(4) }) as unknown as File;

describe("extractBookMetadata for a PDF", () => {
  beforeEach(() => {
    mockLoadingTask.destroy.mockClear();
    jest.spyOn(console, "warn").mockImplementation(() => {}); // no cover page in these documents
    jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it("reads the metadata, then destroys the pdf.js document and its worker", async () => {
    mockLoadingTask.promise = Promise.resolve({
      numPages: 12,
      getMetadata: async () => ({ info: { Title: "On Computable Numbers", Author: "A. M. Turing" } }),
      getPage: async () => {
        throw new Error("no page");
      },
    });

    await expect(extractBookMetadata(pdfFile())).resolves.toMatchObject({
      title: "On Computable Numbers",
      author: "A. M. Turing",
      pageCount: 12,
    });
    expect(mockLoadingTask.destroy).toHaveBeenCalledTimes(1);
  });

  it("destroys the document when parsing it fails", async () => {
    mockLoadingTask.promise = Promise.resolve({
      getMetadata: async () => {
        throw new Error("corrupt");
      },
    });

    await expect(extractBookMetadata(pdfFile())).resolves.toEqual({ pageCount: null });
    expect(mockLoadingTask.destroy).toHaveBeenCalledTimes(1);
  });
});
