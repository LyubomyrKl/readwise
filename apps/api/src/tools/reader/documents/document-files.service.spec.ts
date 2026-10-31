import { PassThrough } from 'stream';
import type { Response } from 'express';
import type { PrismaService } from '@platform/db/prisma.service';
import type { ObjectStream, StorageService } from '@platform/storage/storage.service';
import { DocumentFilesService, singleRange } from './document-files.service';

type Recorded = Response & PassThrough & { headers: Record<string, unknown>; statusCode: number };

/** A response stand-in: a writable stream that records the status and the headers the service sets. */
function response(): Recorded {
  const res = new PassThrough() as unknown as Recorded;
  res.headers = {};
  res.statusCode = 200;
  (res as unknown as { setHeader: (k: string, v: unknown) => Recorded }).setHeader = (key, value) => {
    res.headers[key.toLowerCase()] = value;
    return res;
  };
  (res as unknown as { status: (code: number) => Recorded }).status = (code) => {
    res.statusCode = code;
    return res;
  };
  return res;
}

const SHA = 'a'.repeat(64);
const BOOK = { id: 'b1', userId: 'u1', fileStorageKey: 'u1-123-book.pdf', customCoverStorageKey: null, sha256: SHA, sizeBytes: BigInt(1000) };

function empty(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({ start: (controller) => controller.close() });
}

function service(get: (range?: string) => Promise<ObjectStream>) {
  const prisma = { book: { findFirst: () => Promise.resolve(BOOK) } };
  const storage = { getObjectStream: jest.fn((_bucket: string, _key: string, range?: string) => get(range)) };
  return { files: new DocumentFilesService(prisma as unknown as PrismaService, storage as unknown as StorageService), storage };
}

const whole = () => Promise.resolve({ stream: empty(), contentType: 'application/pdf', contentLength: 1000 });
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('DocumentFilesService downloads', () => {
  it('serves the whole file with what range readers and caches need', async () => {
    const { files, storage } = service(whole);
    const res = response();
    await files.downloadBook('u1', 'b1', res);

    expect(storage.getObjectStream).toHaveBeenCalledWith('books', BOOK.fileStorageKey, undefined);
    expect(res.statusCode).toBe(200);
    expect(res.headers).toMatchObject({
      'accept-ranges': 'bytes',
      'content-length': 1000,
      'content-type': 'application/pdf',
      etag: `"${SHA}"`,
      'cache-control': 'private, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    });
    expect(String(res.headers['content-disposition'])).toMatch(/^attachment;/);
  });

  it('answers one byte range with 206 and its Content-Range', async () => {
    const { files, storage } = service((range) =>
      Promise.resolve({ stream: empty(), contentType: 'application/pdf', contentLength: 100, contentRange: `bytes 0-99/1000 (${range})` }),
    );
    const res = response();
    await files.downloadBook('u1', 'b1', res, { range: 'bytes=0-99' });

    expect(storage.getObjectStream).toHaveBeenCalledWith('books', BOOK.fileStorageKey, 'bytes=0-99');
    expect(res.statusCode).toBe(206);
    expect(res.headers['content-length']).toBe(100);
    expect(res.headers['content-range']).toBe('bytes 0-99/1000 (bytes=0-99)');
  });

  it('answers a revalidation of the same file with 304 and reads nothing', async () => {
    const { files, storage } = service(whole);
    const res = response();
    await files.downloadBook('u1', 'b1', res, { ifNoneMatch: `"other", "${SHA}"` });

    expect(res.statusCode).toBe(304);
    expect(storage.getObjectStream).not.toHaveBeenCalled();
  });

  it('serves the whole file when If-Range names another version', async () => {
    const { files, storage } = service(whole);
    const res = response();
    await files.downloadBook('u1', 'b1', res, { range: 'bytes=0-99', ifRange: '"stale"' });

    expect(storage.getObjectStream).toHaveBeenCalledWith('books', BOOK.fileStorageKey, undefined);
    expect(res.statusCode).toBe(200);
  });

  it('answers a range past the end with 416 and the size', async () => {
    const { files } = service(() => Promise.reject(Object.assign(new Error('range'), { name: 'InvalidRange' })));
    const res = response();
    await files.downloadBook('u1', 'b1', res, { range: 'bytes=5000-' });

    expect(res.statusCode).toBe(416);
    expect(res.headers['content-range']).toBe('bytes */1000');
  });

  it('never serves a stored type the browser could run', async () => {
    const { files } = service(() => Promise.resolve({ stream: empty(), contentType: 'text/html', contentLength: 10 }));
    const res = response();
    await files.downloadBook('u1', 'b1', res);

    expect(res.headers['content-type']).toBe('application/octet-stream');
  });

  it('cuts the response off when storage fails mid-body, without an uncaught error', async () => {
    let sent = 0;
    const failing = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent++ === 0) controller.enqueue(new Uint8Array(1024));
        else controller.error(new Error('ECONNRESET'));
      },
    });
    const { files } = service(() => Promise.resolve({ stream: failing, contentType: 'application/pdf' }));
    const res = response();
    res.resume();
    await files.downloadBook('u1', 'b1', res);
    await settle();
    expect(res.destroyed).toBe(true);
  });

  it('lets go of the storage stream when the client goes away', async () => {
    let cancelled = false;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(1024));
      },
      cancel() {
        cancelled = true;
      },
    });
    const { files } = service(() => Promise.resolve({ stream: endless, contentType: 'application/pdf' }));
    const res = response();
    await files.downloadBook('u1', 'b1', res);
    res.destroy();
    await settle();
    expect(cancelled).toBe(true);
  });
});

describe('singleRange', () => {
  it.each([
    ['bytes=0-65535', 'bytes=0-65535'],
    ['bytes=1000-', 'bytes=1000-'],
    ['bytes=-500', 'bytes=-500'],
    [' bytes=0-1 ', 'bytes=0-1'],
  ])('accepts %s', (header, expected) => {
    expect(singleRange(header)).toBe(expected);
  });

  it.each([undefined, '', 'bytes=-', 'bytes=5-2', 'bytes=0-1,4-5', 'items=0-1', 'bytes=a-b'])('ignores %s', (header) => {
    expect(singleRange(header)).toBeUndefined();
  });
});
