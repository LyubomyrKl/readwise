import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReaderToolLayout } from "@tools/reader/ReaderToolLayout";
import UploadPage from "@tools/reader/pages/UploadPage";

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@tools/reader/documents/bookParser", () => ({
  extractBookMetadata: jest.fn().mockResolvedValue({ title: "Dune", author: "Frank Herbert", pageCount: 412 }),
}));

/** XHR stub: an upload stays in flight until the test finishes it. */
class FakeXHR {
  static all: FakeXHR[] = [];
  upload = { addEventListener: jest.fn() };
  listeners: Record<string, (() => void)[]> = {};
  status = 0;
  responseText = "";
  withCredentials = false;
  timeout = 0;
  constructor() {
    FakeXHR.all.push(this);
  }
  addEventListener(type: string, fn: () => void) {
    (this.listeners[type] ??= []).push(fn);
  }
  open() {}
  send() {}
  abort() {
    this.listeners.abort?.forEach((fn) => fn());
  }
}

describe("UploadPage inside the reader layout", () => {
  beforeAll(() => {
    (global as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = FakeXHR;
  });
  beforeEach(() => {
    FakeXHR.all = [];
  });

  it("queues uploads in the layout's provider, so they go on after leaving the page and show in the widget", async () => {
    const client = new QueryClient();
    const tree = (page: React.ReactNode) => (
      <QueryClientProvider client={client}>
        <ReaderToolLayout>{page}</ReaderToolLayout>
      </QueryClientProvider>
    );
    const view = render(tree(<UploadPage />));

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(["%PDF"], "dune.pdf", { type: "application/pdf" })] } });
    });
    const upload = await screen.findByRole("button", { name: "Upload (1)" });
    await act(async () => {
      fireEvent.click(upload);
    });
    await waitFor(() => expect(FakeXHR.all).toHaveLength(1));
    expect(screen.getByText("Upload Progress")).toBeInTheDocument();

    // the user opens the library while the upload runs
    view.rerender(tree(<p>Library</p>));
    expect(screen.queryByText("Upload Progress")).toBeNull();
    expect(screen.getByText("Uploading (1)")).toBeInTheDocument();

    await act(async () => {
      const [xhr] = FakeXHR.all;
      xhr.status = 201;
      xhr.responseText = '{"bookId":"b1","status":"ready"}';
      xhr.listeners.load?.forEach((fn) => fn());
    });
    expect(screen.getByText("Uploads (1)")).toBeInTheDocument();
  });
});
