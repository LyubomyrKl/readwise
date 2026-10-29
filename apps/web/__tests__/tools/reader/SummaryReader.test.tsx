import { Component, type ReactNode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { SummaryReader } from "@tools/reader/summaries/SummaryReader";
import type { Summary, SummarySection } from "@tools/reader/summaries/types";

class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    return this.state.error ? <p>boundary: {this.state.error.message}</p> : this.props.children;
  }
}

const section = (n: number): SummarySection => ({
  id: `s${n}`, title: `Chapter title ${n}`, level: "chapter", start_char: n, end_char: n + 1, content: `content ${n}`,
});
const summaryOf = (count: number): Summary => ({ sections: Array.from({ length: count }, (_, i) => section(i + 1)) });

async function open(summary: Summary, summaryId: string) {
  await act(async () => {
    render(
      <Boundary>
        <SummaryReader summary={summary} summaryId={summaryId} />
      </Boundary>
    );
  });
}

describe("SummaryReader position", () => {
  beforeAll(() => {
    Element.prototype.scrollTo = jest.fn(); // not in jsdom
  });
  beforeEach(() => localStorage.clear());

  it("restores the section this summary was left on", async () => {
    localStorage.setItem("summary-reader.position.sum-a", "1");
    await open(summaryOf(3), "sum-a");
    // the previous section animates out first
    expect(await screen.findByText("Chapter title 2")).toBeInTheDocument();
    expect(screen.getByText("2 of 3")).toBeInTheDocument();
  });

  it("starts a summary at its first section whatever another summary was left on", async () => {
    localStorage.setItem("summary-reader.position.sum-long", "9");
    localStorage.setItem("summary-reader", JSON.stringify({ theme: "sepia", currentIdx: 9 })); // the old, shared format
    await open(summaryOf(2), "sum-short");
    expect(screen.queryByText(/boundary:/)).toBeNull();
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
  });

  it("clamps a stored index past the end to the last section", async () => {
    localStorage.setItem("summary-reader.position.sum-a", "9");
    await open(summaryOf(2), "sum-a");
    expect(screen.queryByText(/boundary:/)).toBeNull();
    expect(await screen.findByText("Chapter title 2")).toBeInTheDocument();
    expect(screen.getByText("2 of 2")).toBeInTheDocument();
  });

  it("saves the position under the summary's own key", async () => {
    await open(summaryOf(3), "sum-a");
    await act(async () => {
      fireEvent.click(screen.getByText("Next section"));
    });
    expect(localStorage.getItem("summary-reader.position.sum-a")).toBe("1");
    expect(JSON.parse(localStorage.getItem("summary-reader")!)).not.toHaveProperty("currentIdx");
  });

  it("shows an empty state for a summary without sections", async () => {
    localStorage.setItem("summary-reader.position.sum-empty", "3");
    await open({ sections: [] }, "sum-empty");
    expect(screen.queryByText(/boundary:/)).toBeNull();
    expect(screen.getByText("This summary has no sections.")).toBeInTheDocument();
  });
});
