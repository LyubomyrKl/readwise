import { render, screen } from "@testing-library/react";
import { JobProgress, jobLabel } from "@platform/jobs/JobProgress";
import { jobDuration, type JobResponse } from "@platform/jobs/types";

const job = (overrides: Partial<JobResponse> = {}): JobResponse => ({
  id: "j1",
  type: "reader.summarize",
  toolId: "reader",
  userId: "u",
  status: "running",
  progress: 42,
  attempts: 1,
  maxAttempts: 3,
  createdAt: "2026-10-25T10:00:00Z",
  stage: "section 3/12",
  ...overrides,
});

describe("JobProgress", () => {
  it("shows the real stage and progress", () => {
    render(<JobProgress job={job()} />);
    expect(screen.getByText("section 3/12")).toBeInTheDocument();
    expect(screen.getByText("42%")).toBeInTheDocument();
    expect(screen.getByText("Running")).toBeInTheDocument();
  });

  it("explains a waiting job and how it resumes", () => {
    render(<JobProgress job={job({ status: "waiting", waitReason: "LLM host unreachable: http://ollama:11434" })} />);
    expect(screen.getByText(/Waiting: LLM host unreachable/)).toBeInTheDocument();
    expect(screen.getByText(/Start the LLM host/)).toBeInTheDocument();
  });

  it("shows the parent's stage while the child is queued behind it", () => {
    render(<JobProgress job={job({ status: "queued", progress: 0 })} parent={job({ id: "p", type: "reader.extract", stage: "extracting pdf", progress: 50 })} />);
    expect(screen.getByText("Extract: extracting pdf")).toBeInTheDocument();
  });

  it("offers cancel while active and retry after a failure", () => {
    const { rerender } = render(<JobProgress job={job()} onCancel={() => {}} onRetry={() => {}} />);
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();

    rerender(<JobProgress job={job({ status: "failed", error: "model not found" })} onCancel={() => {}} onRetry={() => {}} />);
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    expect(screen.getByText("model not found")).toBeInTheDocument();
  });

  it("labels job types", () => {
    expect(jobLabel("reader.summarize")).toBe("Summarize");
    expect(jobLabel("x.two_pass")).toBe("Two pass");
  });
});

describe("jobDuration", () => {
  it("formats the time between start and finish", () => {
    expect(jobDuration({ startedAt: "2026-10-25T10:00:00Z", finishedAt: "2026-10-25T10:00:07Z" })).toBe("7s");
    expect(jobDuration({ startedAt: "2026-10-25T10:00:00Z", finishedAt: "2026-10-25T10:12:05Z" })).toBe("12m 05s");
    expect(jobDuration({ startedAt: "2026-10-25T10:00:00Z", finishedAt: "2026-10-25T13:30:00Z" })).toBe("3h 30m");
    expect(jobDuration({ startedAt: "2026-10-25T10:00:00Z", finishedAt: null })).toBeNull();
  });
});
