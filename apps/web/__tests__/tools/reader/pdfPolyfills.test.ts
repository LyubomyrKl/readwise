/**
 * @jest-environment node
 */
import { installStreamIteration } from "@tools/reader/reading/engines/pdf/polyfills";

describe("installStreamIteration", () => {
  it("lets `for await` read a ReadableStream where the browser cannot (WebKit)", async () => {
    const proto = ReadableStream.prototype as unknown as Record<symbol, unknown>;
    const native = proto[Symbol.asyncIterator];
    delete proto[Symbol.asyncIterator];
    try {
      installStreamIteration();
      const stream = new ReadableStream<number>({
        start(controller) {
          [1, 2, 3].forEach((n) => controller.enqueue(n));
          controller.close();
        },
      });
      const seen: number[] = [];
      for await (const n of stream as unknown as AsyncIterable<number>) seen.push(n);
      expect(seen).toEqual([1, 2, 3]);
    } finally {
      if (native) Object.defineProperty(proto, Symbol.asyncIterator, { value: native, writable: true, configurable: true });
    }
  });
});
