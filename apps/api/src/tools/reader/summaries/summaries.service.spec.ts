import { NotFoundException } from '@nestjs/common';
import { JobsService } from '@platform/jobs/jobs.service';
import { EXCHANGES } from '@platform/queue/topology';
import { SummariesService } from './summaries.service';
import { FakePrisma, FakeQueue, fakeConfig } from '../../../../test/fakes/fake-prisma';

describe('SummariesService', () => {
  let prisma: FakePrisma;
  let queue: FakeQueue;
  let jobs: JobsService;
  let service: SummariesService;
  const storage = {
    getJson: jest.fn(),
    listKeys: jest.fn(),
    deleteObjects: jest.fn(),
  };
  const documents = { getOwnedBook: jest.fn() };

  const book = (overrides: Record<string, unknown> = {}) => ({
    id: 'book-1',
    userId: 'user-1',
    title: 'A Book',
    fileStorageKey: 'user-1-1-a-book.pdf',
    mime: 'application/pdf',
    extractionStorageKey: null,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = new FakePrisma();
    queue = new FakeQueue();
    jobs = new JobsService(prisma as never, queue as never, fakeConfig() as never);
    service = new SummariesService(prisma as never, storage as never, jobs, documents as never);
    documents.getOwnedBook.mockImplementation((userId: string, bookId: string) =>
      userId === 'user-1' && bookId === 'book-1' ? Promise.resolve(book()) : Promise.reject(new NotFoundException()),
    );
    storage.listKeys.mockResolvedValue([]);
    storage.deleteObjects.mockResolvedValue(undefined);
  });

  const envelopes = () => queue.publishedTo(EXCHANGES.jobs).map((p) => p.message as Record<string, unknown>);

  describe('create', () => {
    it('for a book without extraction: a summary row, an extract job and a waiting summarize child; only the extract is published', async () => {
      const result = await service.create('user-1', 'book-1', 'abstractive', 'two_pass');

      expect(result.existing).toBe(false);
      const summary = (await prisma.summary.findUnique({ where: { id: result.summaryId } }))!;
      expect(summary).toMatchObject({ bookId: 'book-1', userId: 'user-1', type: 'abstractive', strategy: 'two_pass', percent: 0.4, jobId: result.jobId, storageKey: null });

      const extract = (await prisma.job.findUnique({ where: { id: result.extractJobId! } }))!;
      const summarize = (await prisma.job.findUnique({ where: { id: result.jobId } }))!;
      expect(extract).toMatchObject({ type: 'reader.extract', toolId: 'reader', subjectType: 'book', subjectId: 'book-1', correlationId: result.summaryId, status: 'queued' });
      expect(extract.payload).toEqual({ bookId: 'book-1', fileStorageKey: 'user-1-1-a-book.pdf', mime: 'application/pdf', title: 'A Book' });
      expect(summarize).toMatchObject({ type: 'reader.summarize', parentJobId: extract.id, status: 'queued' });
      expect(summarize.payload).toMatchObject({ bookId: 'book-1', summaryId: result.summaryId, summaryType: 'abstractive', strategy: 'two_pass', summaryPercent: 0.4, extractionStorageKey: null });

      expect(envelopes().map((e) => e.type)).toEqual(['reader.extract']);
    });

    it('for an already extracted book publishes the summarize job directly with the extraction key', async () => {
      documents.getOwnedBook.mockResolvedValue(book({ extractionStorageKey: 'extraction/book-1_extraction.md' }));

      const result = await service.create('user-1', 'book-1');

      expect(result.extractJobId).toBeNull();
      expect(envelopes()).toHaveLength(1);
      expect(envelopes()[0]).toMatchObject({ type: 'reader.summarize', jobId: result.jobId });
      expect((envelopes()[0].payload as Record<string, unknown>).extractionStorageKey).toBe('extraction/book-1_extraction.md');
      expect((envelopes()[0].payload as Record<string, unknown>).summaryType).toBe('abstractive');
    });

    it('returns the running summary instead of queueing a second one with the same options', async () => {
      const first = await service.create('user-1', 'book-1', 'abstractive', 'structured');
      const again = await service.create('user-1', 'book-1', 'abstractive', 'structured');

      expect(again).toMatchObject({ summaryId: first.summaryId, jobId: first.jobId, existing: true, storageKey: null });
      expect(await prisma.summary.count()).toBe(1);
      expect(envelopes()).toHaveLength(1);
    });

    it('different options start a second summary of the same book', async () => {
      await service.create('user-1', 'book-1', 'abstractive', 'structured');
      const other = await service.create('user-1', 'book-1', 'extractive', 'basic');
      expect(other.existing).toBe(false);
      expect(await prisma.summary.count()).toBe(2);
    });

    it('returns the finished summary with its storage key', async () => {
      const first = await service.create('user-1', 'book-1');
      await service.setStorageKey(first.summaryId, 'summary/book-1/s1.json');

      const again = await service.create('user-1', 'book-1');

      expect(again).toMatchObject({ summaryId: first.summaryId, existing: true, storageKey: 'summary/book-1/s1.json' });
    });

    it('rejects books that do not belong to the user', async () => {
      await expect(service.create('user-2', 'book-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(queue.published).toHaveLength(0);
    });
  });

  describe('state and compatibility shims', () => {
    const workerEvent = (jobId: string, event: 'started' | 'progress' | 'waiting' | 'succeeded' | 'failed', extra: Record<string, unknown> = {}) =>
      jobs.applyEvent({ v: 1, jobId, event, at: '2026-10-25T10:00:00.000Z', workerId: 'w', ...extra } as never);

    it('reports processing while jobs are active, with stage and progress from the summarize job', async () => {
      const created = await service.create('user-1', 'book-1');
      await workerEvent(created.extractJobId!, 'started');

      const status = await service.getSummaryStatusCompat('user-1', 'book-1');
      expect(status).toMatchObject({ status: 'processing', isReady: false, bookId: 'book-1', summaryId: created.summaryId, jobId: created.jobId, jobStatus: 'queued' });

      await workerEvent(created.jobId, 'started');
      await workerEvent(created.jobId, 'waiting', { reason: 'LLM host unreachable', stage: 'section 1/3', progress: 10 });
      expect(await service.getSummaryStatusCompat('user-1', 'book-1')).toMatchObject({
        status: 'processing', jobStatus: 'waiting', stage: 'section 1/3', progress: 10, waitReason: 'LLM host unreachable',
      });
      expect(await service.compatStateForBook('user-1', 'book-1')).toEqual({ summaryKey: null, status: 'processing', errorMessage: null });
    });

    it('reports ready with the stored key, type and strategy; falls back to the job result when the hook did not write the key', async () => {
      const created = await service.create('user-1', 'book-1', 'extractive', 'basic');
      await workerEvent(created.jobId, 'started');
      await workerEvent(created.jobId, 'succeeded', { result: { storageKey: 'summary/book-1/x.json' } });

      expect(await service.getSummaryStatusCompat('user-1', 'book-1')).toMatchObject({
        status: 'ready', isReady: true, summaryKey: 'summary/book-1/x.json', summaryType: 'extractive', summarizationStrategy: 'basic',
      });
      const list = await service.listForBook('user-1', 'book-1');
      expect(list[0]).toMatchObject({ state: 'ready', storageKey: 'summary/book-1/x.json' });
    });

    it('reports error with the job error after a final failure', async () => {
      const created = await service.create('user-1', 'book-1');
      await workerEvent(created.jobId, 'started', { attempt: 1 });
      await workerEvent(created.jobId, 'failed', { error: 'Unsupported file type', retryable: false });

      expect(await service.getSummaryStatusCompat('user-1', 'book-1')).toMatchObject({ status: 'error', isReady: false, errorMessage: 'Unsupported file type' });
      const compat = await service.compatStateForUser('user-1');
      expect(compat.get('book-1')).toEqual({ summaryKey: null, status: 'error', errorMessage: 'Unsupported file type' });
    });

    it('serves the JSON of the latest finished summary and 404s before that', async () => {
      await expect(service.getSummaryByBookIdCompat('user-1', 'book-1')).rejects.toBeInstanceOf(NotFoundException);
      const created = await service.create('user-1', 'book-1', 'abstractive', 'two_pass');
      await service.setStorageKey(created.summaryId, 'summary/book-1/s.json');
      storage.getJson.mockResolvedValue({ sections: [{ id: 's1', title: 'One' }] });

      const result = await service.getSummaryByBookIdCompat('user-1', 'book-1');

      expect(storage.getJson).toHaveBeenCalledWith('summaries', 'summary/book-1/s.json');
      expect(result).toMatchObject({ bookId: 'book-1', summaryId: created.summaryId, summaryType: 'abstractive', summarizationStrategy: 'two_pass', summaryKey: 'summary/book-1/s.json', summary: { sections: [{ id: 's1' }] } });
      await expect(service.getContent('user-1', created.summaryId)).resolves.toMatchObject({ state: 'ready', summary: { sections: expect.any(Array) } });
    });

    it('status for a book without summaries is "not ready" rather than an error', async () => {
      await expect(service.getSummaryStatusCompat('user-1', 'book-1')).resolves.toEqual({ status: 'ready', bookId: 'book-1', isReady: false, errorMessage: null });
      await expect(service.getSummaryStatusCompat('user-1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('deleteForBook', () => {
    it('cancels active jobs and deletes summary objects and checkpoints of the book', async () => {
      const created = await service.create('user-1', 'book-1');
      storage.listKeys.mockImplementation((bucket: string, prefix: string) =>
        Promise.resolve(bucket === 'summaries' ? [`${prefix}old.json`] : [`${prefix}abstractive.json`]),
      );

      await service.deleteForBook('user-1', 'book-1');

      expect((await prisma.job.findUnique({ where: { id: created.extractJobId! } }))!.status).toBe('cancelled');
      expect((await prisma.job.findUnique({ where: { id: created.jobId } }))!.status).toBe('cancelled');
      expect(storage.listKeys).toHaveBeenCalledWith('summaries', 'summary/book-1/');
      expect(storage.listKeys).toHaveBeenCalledWith('checkpoints', 'checkpoint/book-1_');
      expect(storage.deleteObjects).toHaveBeenCalledWith('summaries', ['summary/book-1/old.json']);
      expect(storage.deleteObjects).toHaveBeenCalledWith('checkpoints', ['checkpoint/book-1_abstractive.json']);
    });
  });
});
