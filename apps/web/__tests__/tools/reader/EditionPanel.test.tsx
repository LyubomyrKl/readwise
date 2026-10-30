import { type ReactNode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EditionPanel } from "@tools/reader/editions/EditionPanel";
import { readerApi } from "@tools/reader/api";
import type { EditionResponse } from "@tools/reader/types";

const push = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@tools/reader/api", () => ({
  readerApi: {
    editions: { listForBook: jest.fn(), create: jest.fn() },
    documents: { structure: jest.fn().mockRejectedValue(new Error("The structure of this book has not been read yet")) },
  },
}));
jest.mock("@platform/jobs/useJob", () => ({
  useJob: () => ({
    job: { id: "j1", type: "reader.abridge", status: "running", stage: "chapter 2 of 9: part 1 of 3", progress: 21, attempts: 1 },
    cancel: jest.fn(),
    isActive: true,
  }),
}));
jest.mock("@platform/jobs/JobProgress", () => ({
  JobProgress: ({ job }: { job: { stage: string } }) => <p>progress: {job.stage}</p>,
}));

const listForBook = readerApi.editions.listForBook as jest.Mock;
const create = readerApi.editions.create as jest.Mock;

function edition(overrides: Partial<EditionResponse>): EditionResponse {
  return { id: "e1", bookId: "b1", length: "standard", figures: "key", state: "ready", createdAt: "2026-10-30T00:00:00Z", ...overrides };
}

async function show(ui: ReactNode) {
  await act(async () => {
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
}

describe("EditionPanel", () => {
  beforeEach(() => jest.clearAllMocks());

  it("asks for length and pictures and starts the edition with them", async () => {
    listForBook.mockResolvedValue([]);
    create.mockResolvedValue({ editionId: "e1", jobId: "j1", existing: false });
    await show(<EditionPanel bookId="b1" />);

    fireEvent.click(screen.getByRole("button", { name: /Longer/ }));
    fireEvent.click(screen.getByRole("button", { name: /All pictures/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Make abridged edition/ }));
    });

    expect(create).toHaveBeenCalledWith("b1", { length: "long", figures: "all" });
  });

  it("follows the edition being made instead of offering a new one", async () => {
    listForBook.mockResolvedValue([edition({ state: "running", jobId: "j1", job: { id: "j1", status: "running" } as never })]);
    await show(<EditionPanel bookId="b1" />);

    expect(screen.getByText("progress: chapter 2 of 9: part 1 of 3")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Make abridged edition/ })).toBeNull();
  });

  it("shows which sections the edition keeps and which it leaves out", async () => {
    listForBook.mockResolvedValue([]);
    (readerApi.documents.structure as jest.Mock).mockResolvedValueOnce({
      bookId: "b1",
      structure: {
        language: "uk", words: 5000, structureSource: "toc", sections: [
          { id: "s1", title: "Зміст", level: 1, kind: "toc", words: 80, figures: 0, included: false },
          { id: "s2", title: "Розділ 1", level: 1, kind: "chapter", words: 4900, figures: 2, included: true },
        ],
      },
    });
    await show(<EditionPanel bookId="b1" />);

    expect(screen.getByTestId("edition-structure")).toHaveTextContent(
      "What the edition will include: 1 of 2 sections, from the book's own contents");
    expect(screen.getByText("Зміст")).toHaveClass("min-w-0");
  });

  it("opens a finished edition in the reader", async () => {
    listForBook.mockResolvedValue([
      edition({ editionBookId: "b2", result: { chapters: 12, ratio: 0.31, pictures: 4, fixedSentences: 3 } }),
    ]);
    await show(<EditionPanel bookId="b1" />);

    expect(screen.getByTestId("edition-ready")).toHaveTextContent("12 chapters at 31% of the original, 4 pictures");
    fireEvent.click(screen.getByRole("button", { name: /Read the edition/ }));
    expect(push).toHaveBeenCalledWith(expect.stringMatching(/\/book\/b2\/read$/));
  });
});
