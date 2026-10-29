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

class FakeEventSource {
  static last: FakeEventSource | null = null;
  listeners: Record<string, ((e: MessageEvent) => void)[]> = {};
  onerror: ((e: Event) => void) | null = null;
  closed = false;
  constructor(public url: string) {
    FakeEventSource.last = this;
  }
  addEventListener(type: string, fn: (e: MessageEvent) => void) {
    (this.listeners[type] ??= []).push(fn);
  }
  close() {
    this.closed = true;
  }
  emit(data: JobResponse) {
    this.listeners.job?.forEach((fn) => fn({ data: JSON.stringify(data) } as MessageEvent));
  }
}

describe("useJob with an event stream", () => {
  const get = jobsApi.get as jest.Mock;
  beforeAll(() => {
    (global as unknown as { EventSource: unknown }).EventSource = FakeEventSource;
  });
  afterAll(() => {
    delete (global as unknown as { EventSource?: unknown }).EventSource;
  });
  beforeEach(() => get.mockReset());

  it("falls back to polling when the stream drops while the job is still running", async () => {
    get.mockResolvedValue(job({ status: "succeeded", progress: 100 }));
    const onSettled = jest.fn();
    const { result } = renderHook(() => useJob("j1", { intervalMs: 5, onSettled }));

    await act(async () => {
      FakeEventSource.last!.emit(job({ progress: 40 }));
    });
    expect(result.current.job?.progress).toBe(40);

    // a network blip or a proxy restart, mid-job
    await act(async () => {
      FakeEventSource.last!.onerror?.(new Event("error"));
    });

    await waitFor(() => expect(result.current.job?.status).toBe("succeeded"));
    expect(get).toHaveBeenCalledWith("j1");
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(result.current.isActive).toBe(false);
  });

  it("does not poll once the stream delivered the terminal state", async () => {
    const onSettled = jest.fn();
    renderHook(() => useJob("j1", { intervalMs: 5, onSettled }));
    const source = FakeEventSource.last!;

    await act(async () => {
      source.emit(job({ status: "succeeded", progress: 100 }));
    });
    expect(source.closed).toBe(true);
    await act(async () => {
      source.onerror?.(new Event("error"));
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(get).not.toHaveBeenCalled();
    expect(onSettled).toHaveBeenCalledTimes(1);
  });
});
