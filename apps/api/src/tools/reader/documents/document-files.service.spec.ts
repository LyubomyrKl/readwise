import { PassThrough } from 'stream';
import type { Response } from 'express';
import type { PrismaService } from '@platform/db/prisma.service';
import type { StorageService } from '@platform/storage/storage.service';
import { DocumentFilesService } from './document-files.service';

/** A response stand-in: a writable stream with the header calls the service makes. */
function response(): Response & PassThrough {
  const res = new PassThrough() as unknown as Response & PassThrough;
  (res as unknown as { setHeader: () => void }).setHeader = () => undefined;
  return res;
}

function service(stream: ReadableStream) {
  const prisma = { book: { findFirst: () => Promise.resolve({ id: 'b1', userId: 'u1', fileStorageKey: 'u1-123-book.pdf', customCoverStorageKey: null }) } };
  const storage = { getObjectStream: () => Promise.resolve({ stream, contentType: 'application/pdf', contentLength: undefined }) };
  return new DocumentFilesService(prisma as unknown as PrismaService, storage as unknown as StorageService);
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('DocumentFilesService downloads', () => {
  it('cuts the response off when storage fails mid-body, without an uncaught error', async () => {
    let sent = 0;
    const failing = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent++ === 0) controller.enqueue(new Uint8Array(1024));
        else controller.error(new Error('ECONNRESET'));
      },
    });
    const res = response();
    res.resume();
    await service(failing).downloadBook('u1', 'b1', res);
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
    const res = response();
    await service(endless).downloadBook('u1', 'b1', res);
    res.destroy();
    await settle();
    expect(cancelled).toBe(true);
  });
});
