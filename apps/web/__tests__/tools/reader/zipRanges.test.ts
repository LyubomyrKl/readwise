/** @jest-environment node */
import { RangeReader } from "@tools/reader/reading/engines/reflow/zipRanges";

const file = Uint8Array.from({ length: 300_000 }, (_, i) => i % 251);

/** A download endpoint that answers ranges (or ignores them, as some servers do). */
function serve(honoursRanges = true) {
  const ranges: string[] = [];
  global.fetch = jest.fn(async (_url: unknown, init?: RequestInit) => {
    const range = (init?.headers as Record<string, string>).Range;
    ranges.push(range);
    if (!honoursRanges) return new Response(file.slice(), { status: 200 });
    const [, a, b] = /bytes=(\d+)-(\d+)/.exec(range)!;
    return new Response(file.slice(Number(a), Number(b) + 1), { status: 206 });
  }) as unknown as typeof fetch;
  return ranges;
}

async function drain(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  for (let reader = stream.getReader(), r = await reader.read(); !r.done; r = await reader.read()) parts.push(r.value);
  const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  parts.reduce((at, p) => (out.set(p, at), at + p.byteLength), 0);
  return out;
}

describe("RangeReader", () => {
  it("asks for ranges, reads ahead, and answers small reads from what it has", async () => {
    const ranges = serve();
    const reader = new RangeReader("/book", file.length);

    const header = await reader.readUint8Array(1000, 30);
    expect(Array.from(header)).toEqual(Array.from(file.slice(1000, 1030)));
    expect(ranges).toEqual([`bytes=1000-${1000 + 64 * 1024 - 1}`]);

    await reader.readUint8Array(1030, 2000); // inside the read-ahead: no request
    expect(ranges).toHaveLength(1);
    await reader.readUint8Array(file.length - 22, 100); // the end of the file, clipped to its size
    expect(ranges[1]).toBe(`bytes=${file.length - 22}-${file.length - 1}`);
  });

  it("returns copies that start their own buffer (zip.js wraps .buffer in a DataView)", async () => {
    serve();
    const reader = new RangeReader("/book", file.length);
    await reader.readUint8Array(0, 10);
    const inside = await reader.readUint8Array(5, 10);
    expect(inside.byteOffset).toBe(0);
    expect(inside.buffer.byteLength).toBe(10);
  });

  it("streams an entry's data in large pieces from the offset zip.js sets", async () => {
    const ranges = serve();
    const reader = new RangeReader("/book", file.length);
    const stream = Object.assign(reader.readable, { offset: 100, size: 250_000 });
    const data = await drain(stream);
    expect(Array.from(data.slice(0, 5))).toEqual(Array.from(file.slice(100, 105)));
    expect(data.byteLength).toBe(250_000);
    expect(ranges).toEqual(["bytes=100-250099"]);
  });

  it("reads a server that ignores ranges once, then from memory", async () => {
    const ranges = serve(false);
    const reader = new RangeReader("/book", file.length);
    expect(Array.from(await reader.readUint8Array(10, 3))).toEqual(Array.from(file.slice(10, 13)));
    expect(Array.from(await reader.readUint8Array(200_000, 3))).toEqual(Array.from(file.slice(200_000, 200_003)));
    expect(ranges).toHaveLength(1);
    expect(reader.fetched).toBe(file.length);
  });
});
