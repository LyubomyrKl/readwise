import type { FoliateBook } from "./foliate";

/**
 * Up to this size an EPUB is downloaded whole: one request, then every page turn is local. Above
 * it the book is read in ranges, so a large illustrated book shows its first chapter without
 * downloading the rest.
 */
export const WHOLE_FILE_LIMIT = 4 * 1024 * 1024;

/** Reads ahead this much: zip.js asks for an entry's 30-byte header, then its data, then the next entry. */
const READ_AHEAD = 64 * 1024;
/** Entry data streams in pieces of this size (zip.js's own default, 64 KiB, would be many requests for a picture). */
const STREAM_CHUNK = 1024 * 1024;

type EntryStream = ReadableStream<Uint8Array> & { offset?: number; size?: number; diskNumberStart?: number };

/**
 * A zip.js reader over HTTP ranges of the download endpoint. The vendored zip.js build exports only
 * BlobReader, but ZipReader takes any object with `size`, `init()`, `readUint8Array()` and a
 * `readable` stream that zip.js points at an entry's data (`offset`, `size`). Reads return copies,
 * not views: zip.js wraps `.buffer` in a DataView. A server that answers a range with the whole file
 * (200) is read once and served from memory after that.
 */
export class RangeReader {
  initialized = false;
  /** zip.js sets this; the stream below uses STREAM_CHUNK instead */
  chunkSize = STREAM_CHUNK;
  /** bytes that came over the network, for tests and benchmarks */
  fetched = 0;
  private whole: Uint8Array | null = null;
  private window: { start: number; bytes: Uint8Array } | null = null;

  constructor(
    private readonly url: string,
    readonly size: number,
  ) {}

  init(): void {
    this.initialized = true;
  }

  async readUint8Array(offset: number, length: number): Promise<Uint8Array> {
    const end = Math.min(offset + length, this.size);
    if (end <= offset) return new Uint8Array(0);
    if (this.whole) return this.whole.slice(offset, end);
    const cached = this.window;
    if (cached && offset >= cached.start && end <= cached.start + cached.bytes.byteLength) {
      return cached.bytes.slice(offset - cached.start, end - cached.start);
    }
    const last = Math.min(Math.max(end, offset + READ_AHEAD), this.size) - 1;
    const response = await fetch(this.url, { credentials: "same-origin", headers: { Range: `bytes=${offset}-${last}` } });
    if (!response.ok) throw new Error(`The book could not be read (${response.status})`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    this.fetched += bytes.byteLength;
    if (response.status !== 206) {
      this.whole = bytes;
      return bytes.slice(offset, end);
    }
    this.window = { start: offset, bytes };
    return bytes.slice(0, end - offset);
  }

  /** The stream zip.js reads an entry's data from, after setting its offset and size. */
  get readable(): EntryStream {
    let position = 0;
    const read = (offset: number, length: number) => this.readUint8Array(offset, length);
    const stream: EntryStream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const { offset = 0, size = 0 } = stream;
        const length = Math.min(STREAM_CHUNK, size - position);
        if (length > 0) controller.enqueue(await read(offset + position, length));
        position += STREAM_CHUNK;
        if (position >= size) controller.close();
      },
    });
    return stream;
  }
}

type ZipEntry = {
  filename: string;
  uncompressedSize: number;
  getData(writer: unknown): Promise<unknown>;
};

type ZipModule = {
  configure(options: { useWebWorkers: boolean }): void;
  ZipReader: new (reader: RangeReader) => { getEntries(): Promise<ZipEntry[]> };
  TextWriter: new () => unknown;
  BlobWriter: new (type?: string) => unknown;
};

/**
 * An EPUB read in ranges: zip.js reads the central directory from the end of the file, then each
 * entry only when foliate asks for it (container, OPF, navigation, the chapter on screen and its
 * pictures). Section sizes come from the central directory, so progress needs nothing more.
 */
export async function openEpubByRanges(url: string, size: number): Promise<FoliateBook> {
  const zip = (await import("@/src/vendor/foliate-js/vendor/zip.js")) as unknown as ZipModule;
  zip.configure({ useWebWorkers: false });
  const entries = await new zip.ZipReader(new RangeReader(url, size)).getEntries();
  const byName = new Map(entries.map((entry) => [entry.filename, entry]));
  const { EPUB } = (await import("@/src/vendor/foliate-js/epub.js")) as unknown as {
    EPUB: new (loader: {
      entries: ZipEntry[];
      loadText: (name: string) => Promise<string> | null;
      loadBlob: (name: string, type?: string) => Promise<Blob> | null;
      getSize: (name: string) => number;
    }) => { init(): Promise<FoliateBook> };
  };
  return new EPUB({
    entries,
    loadText: (name) => (byName.has(name) ? (byName.get(name)!.getData(new zip.TextWriter()) as Promise<string>) : null),
    loadBlob: (name, type) => (byName.has(name) ? (byName.get(name)!.getData(new zip.BlobWriter(type)) as Promise<Blob>) : null),
    getSize: (name) => byName.get(name)?.uncompressedSize ?? 0,
  }).init();
}
