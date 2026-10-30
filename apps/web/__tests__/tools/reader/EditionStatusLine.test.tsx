import { act, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EditionStatusLine } from "@tools/reader/editions/EditionStatusLine";
import { readerApi } from "@tools/reader/api";

jest.mock("@tools/reader/api", () => ({ readerApi: { editions: { listForBook: jest.fn() } } }));
const listForBook = readerApi.editions.listForBook as jest.Mock;

async function show() {
  await act(async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <EditionStatusLine bookId="b1" />
      </QueryClientProvider>
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
}

const base = { id: "e1", bookId: "b1", length: "standard", figures: "key", createdAt: "2026-10-30T00:00:00Z" };

describe("EditionStatusLine", () => {
  it("shows the edition being made with a small bar", async () => {
    listForBook.mockResolvedValue([{ ...base, state: "running", job: { status: "running", progress: 42, stage: "chapter 5 of 12" } }]);
    await show();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "42");
    expect(screen.getByTestId("edition-status")).toHaveTextContent("Abridged edition: writing chapter 5 of 12 · 42%");
  });

  it("says why the last edition stopped", async () => {
    listForBook.mockResolvedValue([{ ...base, state: "failed", job: { status: "failed", error: "worker lost after 3 attempt(s)" } }]);
    await show();
    expect(screen.getByTestId("edition-status")).toHaveTextContent("The last abridged edition stopped: the worker stopped while making it.");
  });

  it("is empty for a book without editions", async () => {
    listForBook.mockResolvedValue([]);
    await show();
    expect(screen.queryByTestId("edition-status")).toBeNull();
  });
});
