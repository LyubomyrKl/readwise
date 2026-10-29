import { JobsService } from '@platform/jobs/jobs.service';
import { EXCHANGES } from '@platform/queue/topology';
import { ReaderJobHooks } from './reader-job-hooks';
import { FakePrisma, FakeQueue, fakeConfig } from '../../../../test/fakes/fake-prisma';

describe('ReaderJobHooks', () => {
  let prisma: FakePrisma;
  let queue: FakeQueue;
  let jobs: JobsService;
  const documents = { setExtraction: jest.fn().mockResolvedValue(undefined) };
  const summaries = { setStorageKey: jest.fn().mockResolvedValue(undefined) };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = new FakePrisma();
    queue = new FakeQueue();
    jobs = new JobsService(prisma as never, queue as never, fakeConfig() as never);
    new ReaderJobHooks(jobs, documents as never, summaries as never).onModuleInit();
  });

  const event = (jobId: string, kind: 'started' | 'succeeded' | 'failed', extra: Record<string, unknown> = {}) =>
    jobs.applyEvent({ v: 1, jobId, event: kind, at: '2026-10-25T10:00:00.000Z', workerId: 'w', ...extra } as never);

  async function extractWithChild() {
    const extract = await jobs.enqueue({
      type: 'reader.extract', toolId: 'reader', userId: 'u', subjectType: 'book', subjectId: 'book-1',
      payload: { bookId: 'book-1', fileStorageKey: 'f', mime: 'application/pdf' },
    });
    const child = await jobs.create({
      type: 'reader.summarize', toolId: 'reader', userId: 'u', parentJobId: extract.id,
      payload: { bookId: 'book-1', summaryId: 'sum-1', extractionStorageKey: null, summaryType: 'abstractive' },
    });
    queue.published = [];
    return { extract, child };
  }

  it('extract succeeded: records the extraction on the book and publishes the child with the key', async () => {
    const { extract, child } = await extractWithChild();
    await event(extract.id, 'started');

    await event(extract.id, 'succeeded', { result: { extractionStorageKey: 'extraction/book-1_extraction.md' } });

    expect(documents.setExtraction).toHaveBeenCalledWith('book-1', 'extraction/book-1_extraction.md');
    const [published] = queue.publishedTo(EXCHANGES.jobs);
    expect(published.routingKey).toBe('jobs.reader.summarize');
    expect(published.message).toMatchObject({ jobId: child.id, payload: { summaryId: 'sum-1', extractionStorageKey: 'extraction/book-1_extraction.md' } });
    expect((await prisma.job.findUnique({ where: { id: child.id } }))!.payload).toMatchObject({ extractionStorageKey: 'extraction/book-1_extraction.md' });
  });

  it('extract succeeded after its child was cancelled: the child has the key when it is retried', async () => {
    const { extract, child } = await extractWithChild();
    await event(extract.id, 'started');
    await jobs.cancel('u', child.id);

    await event(extract.id, 'succeeded', { result: { extractionStorageKey: 'extraction/book-1_extraction.md' } });
    expect(queue.publishedTo(EXCHANGES.jobs)).toHaveLength(0);

    await jobs.retry('u', child.id);
    const [published] = queue.publishedTo(EXCHANGES.jobs);
    expect(published.message).toMatchObject({ jobId: child.id, payload: { extractionStorageKey: 'extraction/book-1_extraction.md' } });
  });

  it('extract failed for good: cancels the waiting child', async () => {
    const { extract, child } = await extractWithChild();
    await event(extract.id, 'started', { attempt: 1 });

    await event(extract.id, 'failed', { error: 'Unsupported file type', retryable: false });

    const row = (await prisma.job.findUnique({ where: { id: child.id } }))!;
    expect(row.status).toBe('cancelled');
    expect(row.error).toMatch(/extraction failed: Unsupported file type/);
    expect(queue.publishedTo(EXCHANGES.jobs)).toHaveLength(0);
  });

  it('extract failed but re-queued: the child keeps waiting', async () => {
    const { extract, child } = await extractWithChild();
    await event(extract.id, 'started', { attempt: 1 });

    await event(extract.id, 'failed', { error: 'transient' });

    expect((await prisma.job.findUnique({ where: { id: child.id } }))!.status).toBe('queued');
    expect(queue.publishedTo(EXCHANGES.jobs).map((p) => p.routingKey)).toEqual(['jobs.reader.extract']);
  });

  it('summarize succeeded: stores the storage key on the summary', async () => {
    const job = await jobs.enqueue({ type: 'reader.summarize', toolId: 'reader', userId: 'u', payload: { bookId: 'book-1', summaryId: 'sum-1' } });
    await event(job.id, 'started');

    await event(job.id, 'succeeded', { result: { storageKey: 'summary/book-1/sum-1.json', metadata: {} } });

    expect(summaries.setStorageKey).toHaveBeenCalledWith('sum-1', 'summary/book-1/sum-1.json');
  });
});
