import { act, renderHook, waitFor } from "@testing-library/react";
import { useJob } from "@platform/jobs/useJob";
import { jobsApi } from "@platform/jobs/api";
import type { JobResponse } from "@platform/jobs/types";

jest.mock("@platform/jobs/api", () => ({ jobsApi: { get: jest.fn(), cancel: jest.fn(), retry: jest.fn() } }));

const job = (overrides: Partial<JobResponse> = {}): JobResponse => ({
  id: "j1", type: "reader.summarize", toolId: "reader", userId: "u", status: "running", progress: 10,
  attempts: 1, maxAttempts: 3, createdAt: "2026-10-27T10:00:00Z", ...overrides,
});

describe("useJob without an event stream (jsdom has no EventSource)", () => {
  const get = jobsApi.get as jest.Mock;
  beforeEach(() => {
    get.mockReset();
    expect(typeof EventSource).toBe("undefined");
  });

  it("polls until the job ends, then reports it once", async () => {
    get.mockResolvedValueOnce(job({ progress: 10 })).mockResolvedValueOnce(job({ progress: 60 })).mockResolvedValue(job({ status: "succeeded", progress: 100 }));
    const onSettled = jest.fn();

    const { result } = renderHook(() => useJob("j1", { intervalMs: 5, onSettled }));

    await waitFor(() => expect(result.current.job?.status).toBe("succeeded"));
    await new Promise((r) => setTimeout(r, 25));
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(get.mock.calls.length).toBe(3);
    expect(result.current.isActive).toBe(false);
  });

  it("does nothing without a job id and resubscribes after a retry", async () => {
    const { result } = renderHook(() => useJob(null));
    expect(result.current.job).toBeNull();
    expect(get).not.toHaveBeenCalled();

    get.mockResolvedValue(job({ status: "failed", error: "x" }));
    const { result: r2 } = renderHook(() => useJob("j1", { intervalMs: 5 }));
    await waitFor(() => expect(r2.current.job?.status).toBe("failed"));
    (jobsApi.retry as jest.Mock).mockResolvedValue(job({ status: "queued", attempts: 0 }));
    get.mockResolvedValue(job({ status: "succeeded", attempts: 1 }));
    await act(async () => {
      await r2.current.retry();
    });
    await waitFor(() => expect(r2.current.job?.status).toBe("succeeded"));
  });
});
