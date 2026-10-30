import { JobsService } from '@platform/jobs/jobs.service';
import { ReaderJobHooks } from './reader-job-hooks';
import { FakePrisma, FakeQueue, fakeConfig } from '../../../test/fakes/fake-prisma';

describe('ReaderJobHooks', () => {
  let prisma: FakePrisma;
  let queue: FakeQueue;
  let jobs: JobsService;
  const editions = { setIngest: jest.fn().mockResolvedValue(undefined), complete: jest.fn().mockResolvedValue(null) };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = new FakePrisma();
    queue = new FakeQueue();
    jobs = new JobsService(prisma as never, queue as never, fakeConfig() as never);
    new ReaderJobHooks(jobs, editions as never).onModuleInit();
  });

  const event = (jobId: string, kind: 'started' | 'succeeded' | 'failed', extra: Record<string, unknown> = {}) =>
    jobs.applyEvent({ v: 1, jobId, event: kind, at: '2026-10-25T10:00:00.000Z', workerId: 'w', ...extra } as never);

  it('ingest succeeded: records the IR and the language on the book', async () => {
    const job = await jobs.enqueue({ type: 'reader.ingest', toolId: 'reader', userId: 'u', payload: { bookId: 'book-1' } });
    await event(job.id, 'started');

    await event(job.id, 'succeeded', { result: { irStorageKey: 'ir/abc/ir-v1.json.gz', language: 'uk', chapters: 12 } });

    expect(editions.setIngest).toHaveBeenCalledWith('book-1', 'ir/abc/ir-v1.json.gz', 'uk');
  });

  it('abridge succeeded: the edition is completed with the job result', async () => {
    const job = await jobs.enqueue({ type: 'reader.abridge', toolId: 'reader', userId: 'u', payload: { bookId: 'book-1', editionId: 'ed-1' } });
    await event(job.id, 'started');
    const result = { storageKey: 'u-edition-ed-1.epub', bytes: 1000, irStorageKey: 'ir/abc/ir-v1.json.gz', language: 'en' };

    await event(job.id, 'succeeded', { result });

    expect(editions.complete).toHaveBeenCalledWith('ed-1', result);
    expect(editions.setIngest).toHaveBeenCalledWith('book-1', 'ir/abc/ir-v1.json.gz', null);
  });
});
