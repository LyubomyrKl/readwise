import { JobsService } from '@platform/jobs/jobs.service';
import { EXCHANGES } from '@platform/queue/topology';
import { DocumentsService } from '../documents/documents.service';
import { EditionsService, irPrefixOf, structureKeyOf } from './editions.service';
import { FakePrisma, FakeQueue, fakeConfig } from '../../../../test/fakes/fake-prisma';

describe('EditionsService', () => {
  let prisma: FakePrisma;
  let queue: FakeQueue;
  let service: EditionsService;
  const storage = { listKeys: jest.fn().mockResolvedValue([]), deleteObjects: jest.fn(), getJson: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma = new FakePrisma();
    queue = new FakeQueue();
    const jobs = new JobsService(prisma as never, queue as never, fakeConfig() as never);
    const documents = new DocumentsService(prisma as never, storage as never, {} as never);
    service = new EditionsService(prisma as never, storage as never, jobs, documents);
    await prisma.book.create({
      data: { id: 'book-1', userId: 'user-1', title: 'T', author: 'A', mime: 'application/pdf', sizeBytes: BigInt(1), fileStorageKey: 'f.pdf' },
    });
  });

  it('queues reader.ingest after an upload, and an upload never fails because of it', async () => {
    await service.ingestAfterUpload('user-1', 'book-1');
    const [published] = queue.publishedTo(EXCHANGES.jobs);
    expect(published).toMatchObject({ routingKey: 'jobs.reader.ingest', message: { payload: { bookId: 'book-1', fileStorageKey: 'f.pdf', mime: 'application/pdf' } } });

    queue.publish.mockRejectedValueOnce(new Error('broker down'));
    await expect(service.ingestAfterUpload('user-1', 'book-1')).resolves.toBeUndefined();
    await expect(service.ingestAfterUpload('user-1', 'missing')).resolves.toBeUndefined();
  });

  it('complete() adds the edition book once, with the source author', async () => {
    const { editionId } = await service.create('user-1', 'book-1', {});

    const book = await service.complete(editionId, { storageKey: 'k.epub', bytes: 10, title: 'T (abridged)', language: 'en' });
    const again = await service.complete(editionId, { storageKey: 'k.epub', bytes: 10 });

    expect(book).toMatchObject({ title: 'T (abridged)', author: 'A', mime: 'application/epub+zip', fileStorageKey: 'k.epub' });
    expect(again!.id).toBe(book!.id);
    expect(await prisma.book.count()).toBe(2);
    await expect(service.complete(editionId.replace(/.$/, 'x'), { storageKey: 'k' })).resolves.toBeNull();
  });

  it('a failed edition is made again on request rather than returned', async () => {
    const first = await service.create('user-1', 'book-1', {});
    await prisma.job.update({ where: { id: first.jobId }, data: { status: 'failed' } });

    const second = await service.create('user-1', 'book-1', {});

    expect(second.existing).toBe(false);
    expect(second.editionId).not.toBe(first.editionId);
  });

  it('keeps the structure while another book has the same file', async () => {
    await prisma.book.update({ where: { id: 'book-1' }, data: { irStorageKey: 'ir/abc/ir-v1.json.gz' } });
    await prisma.book.create({
      data: { id: 'book-2', userId: 'user-1', title: 'T', author: 'A', mime: 'application/pdf', sizeBytes: BigInt(1), fileStorageKey: 'g.pdf', irStorageKey: 'ir/abc/ir-v1.json.gz' },
    });
    storage.listKeys.mockImplementation(async (_bucket: string, prefix: string) => [`${prefix}x`]);

    await service.deleteForBook('user-1', 'book-1');

    expect(storage.listKeys).not.toHaveBeenCalledWith('extractions', 'ir/abc/');
  });

  it('derives the IR folder and the structure key from the IR key', () => {
    expect(irPrefixOf('ir/abc/ir-v1.json.gz')).toBe('ir/abc/');
    expect(structureKeyOf('ir/abc/ir-v1.json.gz')).toBe('ir/abc/structure-v1.json');
  });
});
