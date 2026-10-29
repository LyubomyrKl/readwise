import { act, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  UploadProvider,
  useUpload,
  MAX_RETRIES,
  RETRY_DELAY_MS,
  type UploadContextType,
  type UploadFile,
} from "@tools/reader/documents/upload/UploadProvider";

/** XHR stub: an upload stays in flight until the test ends it; abort() fires its event synchronously, like the real one. */
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
    this.fire("abort");
  }
  fire(type: string) {
    this.listeners[type]?.forEach((fn) => fn());
  }
  respond(status: number, body: string) {
    this.status = status;
    this.responseText = body;
    this.fire("load");
  }
}

const file = (name: string): UploadFile => ({
  title: name, author: "a", fileName: `${name}.pdf`, mime: "application/pdf", sizeBytes: 10, file: new File(["x"], `${name}.pdf`),
});

let ctx!: UploadContextType;
function Probe() {
  ctx = useUpload();
  return null;
}

/** Advances fake time and lets the promises it unblocks run. */
const advance = (ms: number) => act(() => jest.advanceTimersByTimeAsync(ms));

describe("UploadProvider", () => {
  beforeAll(() => {
    (global as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = FakeXHR;
  });
  beforeEach(async () => {
    jest.useFakeTimers();
    jest.spyOn(console, "error").mockImplementation(() => {}); // failed uploads are logged
    FakeXHR.all = [];
    render(
      <QueryClientProvider client={new QueryClient()}>
        <UploadProvider>
          <Probe />
        </UploadProvider>
      </QueryClientProvider>
    );
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  async function startOne() {
    act(() => ctx.addUploads([file("a")]));
    await advance(100);
    expect(ctx.uploads[0].status).toBe("uploading");
    return FakeXHR.all[FakeXHR.all.length - 1];
  }

  it("keeps uploads paused by Pause all, so Resume all starts them again", async () => {
    await startOne();

    act(() => ctx.pauseAll());
    await advance(200);
    expect(ctx.uploads[0].status).toBe("paused");
    expect(ctx.uploads[0].error).toBeUndefined();

    act(() => ctx.resumeAll());
    await advance(200);
    expect(ctx.uploads[0].status).toBe("uploading");
    expect(FakeXHR.all).toHaveLength(2);
  });

  it("keeps a single paused upload paused until it is resumed", async () => {
    await startOne();

    act(() => ctx.pauseUpload(ctx.uploads[0].id));
    await advance(200);
    expect(ctx.uploads[0].status).toBe("paused");

    act(() => ctx.resumeUpload(ctx.uploads[0].id));
    await advance(200);
    expect(ctx.uploads[0].status).toBe("uploading");
  });

  it("keeps a cancelled upload marked as cancelled", async () => {
    await startOne();

    act(() => ctx.cancelUpload(ctx.uploads[0].id));
    await advance(200);
    expect(ctx.uploads[0]).toMatchObject({ status: "error", error: "Cancelled", errorCode: "CANCELLED" });
  });

  it("retries a network error after the delay, up to MAX_RETRIES times, then reports it", async () => {
    const first = await startOne();

    act(() => first.fire("error"));
    await advance(100);
    expect(ctx.uploads[0]).toMatchObject({ status: "queued", retryCount: 1 });
    expect(FakeXHR.all).toHaveLength(1); // still waiting out the delay

    await advance(RETRY_DELAY_MS);
    expect(FakeXHR.all).toHaveLength(2);
    expect(ctx.uploads[0].status).toBe("uploading");

    for (let attempt = 2; attempt <= MAX_RETRIES; attempt++) {
      act(() => FakeXHR.all[FakeXHR.all.length - 1].fire("error"));
      await advance(RETRY_DELAY_MS + 100);
    }
    expect(FakeXHR.all).toHaveLength(MAX_RETRIES + 1);

    act(() => FakeXHR.all[FakeXHR.all.length - 1].fire("error"));
    await advance(RETRY_DELAY_MS + 100);
    expect(FakeXHR.all).toHaveLength(MAX_RETRIES + 1);
    expect(ctx.uploads[0]).toMatchObject({ status: "error", errorCode: "NETWORK_ERROR", error: "Network error during upload" });
  });

  it("does not retry a server error", async () => {
    const first = await startOne();

    act(() => first.respond(500, '{"error":"Storage unavailable"}'));
    await advance(RETRY_DELAY_MS + 100);
    expect(FakeXHR.all).toHaveLength(1);
    expect(ctx.uploads[0]).toMatchObject({ status: "error", errorCode: "SERVER_ERROR", error: "Storage unavailable" });
  });

  it("completes an upload that succeeds", async () => {
    const first = await startOne();

    act(() => first.respond(201, '{"bookId":"b1","status":"ready"}'));
    await advance(100);
    expect(ctx.uploads[0]).toMatchObject({ status: "completed", bookId: "b1", progress: 100 });
  });
});
