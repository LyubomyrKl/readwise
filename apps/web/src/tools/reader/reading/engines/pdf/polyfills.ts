/**
 * What PDF.js 6 expects from the browser and WebKit (Safari) lacks: async iteration of a
 * ReadableStream. PDF.js's getTextContent() reads its text stream with `for await`, which throws
 * "undefined is not a function" in WebKit, even in PDF.js's legacy build; in-book search uses it.
 * Installed only where missing, before PDF.js loads.
 */
export function installStreamIteration(): void {
  if (typeof ReadableStream === "undefined") return;
  const proto = ReadableStream.prototype as unknown as Record<symbol | string, unknown>;
  if (typeof proto[Symbol.asyncIterator] === "function") return;
  async function* iterate(this: ReadableStream<unknown>) {
    const reader = this.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  }
  Object.defineProperty(proto, Symbol.asyncIterator, { value: iterate, writable: true, configurable: true });
  if (typeof proto.values !== "function") Object.defineProperty(proto, "values", { value: iterate, writable: true, configurable: true });
}
