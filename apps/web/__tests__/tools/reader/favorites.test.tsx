import { Component, type ReactNode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { BookCard } from "@tools/reader/documents/library/BookCard";
import BookProfile from "@tools/reader/documents/BookProfile";
import { readerApi } from "@tools/reader/api";
import type { IBook } from "@tools/reader/types";

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@tools/reader/api", () => ({ readerApi: { documents: { setFavorite: jest.fn(), delete: jest.fn() } } }));

class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    return this.state.error ? <p>boundary: {this.state.error.message}</p> : this.props.children;
  }
}

const book: IBook = {
  id: "b1", title: "Dune", author: "Frank Herbert", fileUrl: "/api/gw/reader/documents/b1/download", spentTime: 0,
  pagePassCount: 0, isFinished: false, isFavorite: false, mime: "application/pdf", sizeBytes: "1024", status: "ready",
  hasExtraction: false, noteCount: 0, highlightCount: 0, createdAt: "2026-10-25T00:00:00Z", updatedAt: "2026-10-25T00:00:00Z",
};

function renderInApp(ui: ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <Boundary>{ui}</Boundary>
    </QueryClientProvider>
  );
}

/** Clicks a heart and lets the request settle. */
async function toggle(button: Element) {
  await act(async () => {
    fireEvent.click(button);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
}

const setFavorite = readerApi.documents.setFavorite as jest.Mock;

describe("favorite toggles", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("BookCard", () => {
    it("reverts the heart and reports a failed request, without reaching the error boundary", async () => {
      setFavorite.mockRejectedValue(new Error("Failed to fetch"));
      renderInApp(<BookCard book={book} />);

      await toggle(screen.getByRole("button", { name: "Add to favorites" }));

      expect(setFavorite).toHaveBeenCalledWith("b1", true, expect.anything());
      expect(screen.queryByText(/boundary:/)).toBeNull();
      expect(screen.getByRole("button", { name: "Add to favorites" })).toBeInTheDocument();
      expect(toast.error).toHaveBeenCalledWith("Failed to update favorite status");
    });

    it("keeps the new state and confirms a successful toggle", async () => {
      setFavorite.mockResolvedValue({ status: "success" });
      renderInApp(<BookCard book={book} />);

      await toggle(screen.getByRole("button", { name: "Add to favorites" }));

      expect(screen.getByRole("button", { name: "Remove from favorites" })).toBeInTheDocument();
      expect(toast.success).toHaveBeenCalledWith("Added to favorites");
      expect(toast.error).not.toHaveBeenCalled();
    });
  });

  describe("BookProfile", () => {
    /** The header's heart button (the "Favorite" badge has a heart too, outside any button). */
    const heart = (container: HTMLElement) =>
      Array.from(container.querySelectorAll("svg.lucide-heart"), (svg) => svg.closest("button")).find(Boolean)!;

    it("reverts the heart to its real previous value and reports a failed request", async () => {
      setFavorite.mockRejectedValue(new Error("Failed to fetch"));
      const { container } = renderInApp(
        <BookProfile book={{ ...book, isFavorite: true }} notes={[]} summaries={[]} onStartReading={() => {}} onBack={() => {}} />
      );
      expect(heart(container).querySelector("svg")).toHaveClass("fill-current");

      await toggle(heart(container));

      expect(setFavorite).toHaveBeenCalledWith("b1", false, expect.anything());
      expect(screen.queryByText(/boundary:/)).toBeNull();
      expect(heart(container).querySelector("svg")).toHaveClass("fill-current");
      expect(toast.error).toHaveBeenCalledWith("Failed to update favorite status");
    });
  });
});
