import { type ReactNode } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EditionPanel } from "@tools/reader/editions/EditionPanel";
import { readerApi } from "@tools/reader/api";
import { jobsApi } from "@platform/jobs/api";
import type { JobResponse } from "@platform/jobs/types";
import type { EditionResponse } from "@tools/reader/types";

const push = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@tools/reader/api", () => ({
  readerApi: {
    editions: { listForBook: jest.fn(), create: jest.fn(), progress: jest.fn() },
    documents: { structure: jest.fn().mockRejectedValue(new Error("The structure of this book has not been read yet")) },
  },
}));
jest.mock("@platform/jobs/api", () => ({ jobsApi: { retry: jest.fn().mockResolvedValue({}) } }));

let liveJob: Partial<JobResponse> = {};
const cancel = jest.fn().mockResolvedValue(undefined);
jest.mock("@platform/jobs/useJob", () => ({
  useJob: () => ({ job: liveJob, cancel, isActive: ["queued", "running", "waiting"].includes(String(liveJob.status)) }),
}));

const listForBook = readerApi.editions.listForBook as jest.Mock;
const create = readerApi.editions.create as jest.Mock;
const progress = readerApi.editions.progress as jest.Mock;

function edition(overrides: Partial<EditionResponse>): EditionResponse {
  return { id: "e1", bookId: "b1", length: "standard", figures: "key", state: "ready", createdAt: "2026-10-30T00:00:00Z", ...overrides };
}

function job(overrides: Partial<JobResponse>): JobResponse {
  return {
    id: "j1", type: "reader.abridge", toolId: "reader", userId: "u", status: "running", progress: 0, attempts: 1,
    maxAttempts: 3, createdAt: new Date().toISOString(), startedAt: new Date(Date.now() - 12 * 60_000).toISOString(),
    ...overrides,
  } as JobResponse;
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
  beforeEach(() => {
    jest.clearAllMocks();
    progress.mockResolvedValue({ editionId: "e1", state: "running", chapters: [], totalWords: 0, writtenWords: 0, overview: false });
  });

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

  it("says why the edition could not be started, right under the button", async () => {
    listForBook.mockResolvedValue([]);
    create.mockRejectedValue(new Error("This book is itself an abridged edition"));
    await show(<EditionPanel bookId="b1" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Make abridged edition/ }));
    });

    expect(screen.getByTestId("edition-create-error")).toHaveTextContent("This book is itself an abridged edition");
  });

  it("shows the steps, the bar, the time and the chapters of the edition being made", async () => {
    liveJob = job({ status: "running", stage: "fact-checking chapter 2 of 3: part 1 of 2", progress: 51 });
    listForBook.mockResolvedValue([edition({ state: "running", jobId: "j1", job: liveJob as JobResponse })]);
    progress.mockResolvedValue({
      editionId: "e1", state: "running", totalWords: 9000, writtenWords: 9000, overview: false, factcheck: "dense",
      chapters: [
        { id: "u1", title: "Part One", level: 1, divider: true, words: 2, state: "pending" },
        { id: "u2", title: "Chapter 1", level: 2, divider: false, words: 3000, state: "checked" },
        { id: "u3", title: "Chapter 2", level: 2, divider: false, words: 3000, state: "written" },
        { id: "u4", title: "Chapter 3", level: 2, divider: false, words: 3000, state: "written" },
      ],
    });
    await show(<EditionPanel bookId="b1" />);

    expect(screen.getByRole("progressbar", { name: "Edition progress" })).toHaveAttribute("aria-valuenow", "51");
    expect(screen.getByText("Fact-checking chapter 2 of 3 (part 1 of 2)")).toBeInTheDocument();
    const steps = screen.getByTestId("edition-steps");
    expect(within(steps).getByText("Writing").closest("li")).toHaveAttribute("data-state", "done");
    expect(within(steps).getByText("Fact-checking").closest("li")).toHaveAttribute("data-state", "current");
    expect(screen.getByTestId("edition-timing")).toHaveTextContent("Running for 12 min · estimating the time left…");
    const chapters = screen.getByTestId("edition-chapters");
    expect(within(chapters).getByText("Chapter 1").closest("li")).toHaveTextContent("checked · 3,000 words");
    expect(within(chapters).getByText("Chapter 2").closest("li")).toHaveAttribute("data-state", "current");
    expect(within(chapters).getByText("Chapter 2").closest("li")).toHaveTextContent("fact-checking…");
    expect(screen.queryByRole("button", { name: /Make abridged edition/ })).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Stop/ }));
    });
    expect(cancel).toHaveBeenCalled();
  });

  it("explains a pause for the LLM host", async () => {
    liveJob = job({ status: "waiting", stage: "chapter 4 of 9", progress: 20, waitReason: "LLM host unreachable: http://100.64.0.1:11434" });
    listForBook.mockResolvedValue([edition({ state: "waiting", jobId: "j1", job: liveJob as JobResponse })]);
    await show(<EditionPanel bookId="b1" />);

    expect(screen.getByText("Paused: the LLM host does not answer")).toBeInTheDocument();
    expect(screen.getByText("LLM host unreachable: http://100.64.0.1:11434")).toBeInTheDocument();
    expect(screen.getByText("Paused: writing chapter 4 of 9")).toBeInTheDocument();
  });

  it("explains a failure, offers the command, continues the job or starts over with its settings", async () => {
    liveJob = {};
    const failed = edition({
      state: "failed", jobId: "j9", length: "long", figures: "all",
      job: job({ id: "j9", status: "failed", error: "model gemma4:26b-mlx is not on the LLM host (ollama pull gemma4:26b-mlx)" }),
    });
    listForBook.mockResolvedValue([failed]);
    create.mockResolvedValue({ editionId: "e2", jobId: "j2", existing: false });
    await show(<EditionPanel bookId="b1" />);

    const card = screen.getByTestId("edition-error");
    expect(card).toHaveTextContent("A model is missing on the Mac");
    expect(within(card).getByText("ollama pull gemma4:26b-mlx")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(card).getByRole("button", { name: /Continue/ }));
    });
    expect(jobsApi.retry).toHaveBeenCalledWith("j9");
    await act(async () => {
      fireEvent.click(within(card).getByRole("button", { name: /Start over/ }));
    });
    expect(create).toHaveBeenCalledWith("b1", { length: "long", figures: "all" });
  });

  it("does not offer to continue what cannot succeed", async () => {
    listForBook.mockResolvedValue([
      edition({ state: "failed", jobId: "j9", job: job({ id: "j9", status: "failed", error: "No text to abridge: the file has no readable chapters" }) }),
    ]);
    await show(<EditionPanel bookId="b1" />);

    expect(screen.getByTestId("edition-error")).toHaveTextContent("This book has no readable text");
    expect(within(screen.getByTestId("edition-error")).queryByRole("button", { name: /Continue/ })).toBeNull();
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
