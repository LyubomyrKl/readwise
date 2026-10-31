import { extractBookMetadata, reflowPageCount } from "@tools/reader/documents/bookParser";

const mockLoadingTask = { promise: Promise.resolve({}), destroy: jest.fn(() => Promise.resolve()) };
jest.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({ GlobalWorkerOptions: {}, getDocument: jest.fn(() => mockLoadingTask) }));
const mockMakeBook = jest.fn();
jest.mock("@/src/vendor/foliate-js/view.js", () => ({ makeBook: (file: File) => mockMakeBook(file) }));

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

const epubFile = () => ({ name: "book.epub", type: "application/epub+zip" }) as unknown as File;

describe("extractBookMetadata for an EPUB", () => {
  beforeEach(() => {
    mockMakeBook.mockReset();
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it("reads foliate's metadata: language maps, contributors, an HTML description, the cover", async () => {
    const destroy = jest.fn();
    mockMakeBook.mockResolvedValue({
      metadata: {
        title: { ru: "Московия", en: "Moscovia" },
        author: [{ name: "Сигизмунд Герберштейн" }, { name: { ru: "Переводчик" } }],
        description: "<p>Записки о <b>Московии</b>.</p>\n<p>XVI век</p>",
      },
      sections: [{ id: "a", size: 3000 }, { id: "b", size: 1000, linear: "no" }],
      getCover: async () => new Blob(["png"], { type: "image/png" }),
      destroy,
    });

    await expect(extractBookMetadata(epubFile())).resolves.toEqual({
      title: "Московия",
      author: "Сигизмунд Герберштейн, Переводчик",
      description: "Записки о Московии. XVI век",
      pageCount: 2,
      coverImage: expect.stringMatching(/^data:image\/png;base64,/),
    });
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("keeps the metadata when the cover cannot be read", async () => {
    mockMakeBook.mockResolvedValue({
      metadata: { title: "The Problems of Philosophy", author: { name: "Bertrand Russell" } },
      sections: [{ id: "a", size: 1500 }],
      getCover: async () => {
        throw new Error("missing");
      },
    });

    await expect(extractBookMetadata(epubFile())).resolves.toMatchObject({
      title: "The Problems of Philosophy",
      author: "Bertrand Russell",
      pageCount: 1,
      coverImage: undefined,
    });
  });

  it("answers no page count for a file foliate cannot open", async () => {
    mockMakeBook.mockRejectedValue(new Error("not a zip"));
    await expect(extractBookMetadata(epubFile())).resolves.toEqual({ pageCount: null });
  });
});

describe("reflowPageCount", () => {
  it("counts print pages when the book lists them", () => {
    expect(reflowPageCount({ sections: [{ id: "a", size: 99999 }], pageList: [{ label: "i" }, { label: "1" }, { label: "2" }] })).toBe(3);
  });

  it("counts the reader's locations otherwise: 1500 bytes of linear sections each", () => {
    expect(reflowPageCount({ sections: [{ id: "a", size: 1501 }, { id: "b", size: 2000, linear: "no" }, { id: "c" }] })).toBe(2);
    expect(reflowPageCount({ sections: [] })).toBeNull();
  });
});
