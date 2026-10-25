import { JobsService } from './jobs.service';
import { jobEnvelopeSchema, JobEvent } from './contracts';
import { JobEventContext } from './job-hooks';
import { EXCHANGES } from '@platform/queue/topology';
import { FakePrisma, FakeQueue, fakeConfig } from '../../../test/fakes/fake-prisma';

const event = (partial: Partial<JobEvent> & Pick<JobEvent, 'jobId' | 'event'>): JobEvent => ({
  v: 1,
  at: '2026-10-25T10:00:00.000Z',
  workerId: 'worker-test',
  ...partial,
});

describe('JobsService', () => {
  let prisma: FakePrisma;
  let queue: FakeQueue;
  let service: JobsService;
  let hookCalls: JobEventContext[];

  beforeEach(() => {
    prisma = new FakePrisma();
    queue = new FakeQueue();
    hookCalls = [];
    service = new JobsService(prisma as never, queue as never, fakeConfig() as never);
    service.registerHooks('reader', {
      onJobEvent: async (ctx) => {
        hookCalls.push(ctx);
      },
    });
  });

  const enqueueExtract = () =>
    service.enqueue({
      type: 'reader.extract',
      toolId: 'reader',
      userId: 'user-1',
      subjectType: 'book',
      subjectId: 'book-1',
      payload: { bookId: 'book-1', fileStorageKey: 'k', mime: 'application/pdf' },
    });

  describe('enqueue', () => {
    it('creates a queued row and publishes a valid envelope with the routing key of the type', async () => {
      const job = await enqueueExtract();

      expect(job.status).toBe('queued');
      expect(job.maxAttempts).toBe(3);
      const [published] = queue.publishedTo(EXCHANGES.jobs);
      expect(published.routingKey).toBe('jobs.reader.extract');
      expect(jobEnvelopeSchema.parse(published.message)).toMatchObject({
        jobId: job.id,
        type: 'reader.extract',
        toolId: 'reader',
        userId: 'user-1',
        attempt: 1,
        payload: { bookId: 'book-1' },
      });
      expect(published.options).toMatchObject({ messageId: job.id, type: 'reader.extract' });
    });

    it('create() alone does not publish; publish() refuses finished jobs', async () => {
      const job = await service.create({ type: 'reader.summarize', toolId: 'reader', userId: 'u', payload: {} });
      expect(queue.published).toHaveLength(0);
      await prisma.job.update({ where: { id: job.id }, data: { status: 'succeeded' } });
      await expect(service.publish(job.id)).rejects.toThrow(/succeeded/);
    });
  });

  describe('applyEvent', () => {
    it('started -> running with worker, attempt and lease fields', async () => {
      const job = await enqueueExtract();

      const updated = await service.applyEvent(event({ jobId: job.id, event: 'started', attempt: 1 }));

      expect(updated).toMatchObject({ status: 'running', workerId: 'worker-test', attempts: 1 });
      expect(updated!.startedAt).toEqual(new Date('2026-10-25T10:00:00.000Z'));
      expect(updated!.heartbeatAt).toEqual(new Date('2026-10-25T10:00:00.000Z'));
      expect(hookCalls.map((c) => c.event)).toEqual(['started']);
    });

    it('progress refreshes the heartbeat, stage and progress', async () => {
      const job = await enqueueExtract();
      await service.applyEvent(event({ jobId: job.id, event: 'started' }));

      const updated = await service.applyEvent(
        event({ jobId: job.id, event: 'progress', at: '2026-10-25T10:05:00.000Z', stage: 'section 3/12', progress: 25 }),
      );

      expect(updated).toMatchObject({ status: 'running', stage: 'section 3/12', progress: 25 });
      expect(updated!.heartbeatAt).toEqual(new Date('2026-10-25T10:05:00.000Z'));
    });

    it('waiting records the reason and keeps the lease alive; the next progress clears it', async () => {
      const job = await enqueueExtract();
      await service.applyEvent(event({ jobId: job.id, event: 'started' }));

      const waiting = await service.applyEvent(
        event({ jobId: job.id, event: 'waiting', reason: 'LLM host unreachable', at: '2026-10-25T10:06:00.000Z' }),
      );
      expect(waiting).toMatchObject({ status: 'waiting', waitReason: 'LLM host unreachable' });
      expect(waiting!.heartbeatAt).toEqual(new Date('2026-10-25T10:06:00.000Z'));

      const resumed = await service.applyEvent(event({ jobId: job.id, event: 'progress', stage: 'section 4/12' }));
      expect(resumed).toMatchObject({ status: 'running', waitReason: null, stage: 'section 4/12' });
    });

    it('succeeded stores the result, finishes the job and hands the result to the hook', async () => {
      const job = await enqueueExtract();
      await service.applyEvent(event({ jobId: job.id, event: 'started' }));

      const done = await service.applyEvent(
        event({ jobId: job.id, event: 'succeeded', result: { extractionStorageKey: 'extraction/book-1_extraction.md' } }),
      );

      expect(done).toMatchObject({ status: 'succeeded', progress: 100, error: null });
      expect(done!.result).toEqual({ extractionStorageKey: 'extraction/book-1_extraction.md' });
      expect(done!.finishedAt).toBeInstanceOf(Date);
      const hook = hookCalls.at(-1)!;
      expect(hook.event).toBe('succeeded');
      expect(hook.result).toEqual({ extractionStorageKey: 'extraction/book-1_extraction.md' });
    });

    it('a retryable failure below maxAttempts re-queues and re-publishes with the next attempt', async () => {
      const job = await enqueueExtract();
      await service.applyEvent(event({ jobId: job.id, event: 'started', attempt: 1 }));

      const requeued = await service.applyEvent(event({ jobId: job.id, event: 'failed', error: 'broker hiccup' }));

      expect(requeued).toMatchObject({ status: 'queued', error: 'broker hiccup', workerId: null, heartbeatAt: null });
      const envelopes = queue.publishedTo(EXCHANGES.jobs).map((p) => p.message as { attempt: number });
      expect(envelopes.map((e) => e.attempt)).toEqual([1, 2]);
      // the hook sees the re-queued job, not a terminal failure
      expect(hookCalls.at(-1)).toMatchObject({ event: 'failed', job: { status: 'queued' } });
    });

    it('a non-retryable failure, or one past maxAttempts, fails the job', async () => {
      const job = await enqueueExtract();
      await service.applyEvent(event({ jobId: job.id, event: 'started', attempt: 1 }));
      const failed = await service.applyEvent(
        event({ jobId: job.id, event: 'failed', error: 'Unsupported file type', retryable: false }),
      );
      expect(failed).toMatchObject({ status: 'failed', error: 'Unsupported file type' });
      expect(failed!.finishedAt).toBeInstanceOf(Date);

      const other = await enqueueExtract();
      await service.applyEvent(event({ jobId: other.id, event: 'started', attempt: 3 }));
      const exhausted = await service.applyEvent(event({ jobId: other.id, event: 'failed', error: 'still broken' }));
      expect(exhausted!.status).toBe('failed');
      expect(queue.publishedTo(EXCHANGES.jobs)).toHaveLength(2); // no re-publish for either
    });

    it('ignores late events after a terminal state and unknown jobs', async () => {
      const job = await enqueueExtract();
      await service.applyEvent(event({ jobId: job.id, event: 'started' }));
      await service.applyEvent(event({ jobId: job.id, event: 'succeeded', result: { ok: true } }));

      const late = await service.applyEvent(event({ jobId: job.id, event: 'progress', stage: 'late', progress: 10 }));
      expect(late).toMatchObject({ status: 'succeeded', progress: 100 });
      expect(late!.stage).not.toBe('late');

      await expect(service.applyEvent(event({ jobId: 'nope', event: 'started' }))).resolves.toBeNull();
    });

    it('started for a job cancelled while queued re-broadcasts the cancel instead of running it', async () => {
      const job = await enqueueExtract();
      await service.cancel('user-1', job.id);
      queue.published = [];

      const result = await service.applyEvent(event({ jobId: job.id, event: 'started' }));

      expect(result!.status).toBe('cancelled');
      const [control] = queue.publishedTo(EXCHANGES.control);
      expect(control.message).toEqual({ v: 1, jobId: job.id, action: 'cancel' });
    });

    it('a hook that throws does not break the transition', async () => {
      service.registerHooks('reader', {
        onJobEvent: async () => {
          throw new Error('hook exploded');
        },
      });
      const job = await enqueueExtract();
      await expect(service.applyEvent(event({ jobId: job.id, event: 'started' }))).resolves.toMatchObject({
        status: 'running',
      });
    });
  });

  describe('cancel', () => {
    it('cancels an active job, broadcasts a control message and cancels its queued children', async () => {
      const parent = await enqueueExtract();
      const child = await service.create({
        type: 'reader.summarize',
        toolId: 'reader',
        userId: 'user-1',
        parentJobId: parent.id,
        payload: {},
      });

      const cancelled = await service.cancel('user-1', parent.id);

      expect(cancelled).toMatchObject({ status: 'cancelled', error: 'cancelled by user' });
      expect((await prisma.job.findUnique({ where: { id: child.id } }))!.status).toBe('cancelled');
      expect(queue.publishedTo(EXCHANGES.control).map((p) => p.message.jobId)).toEqual([parent.id, child.id]);
      expect(hookCalls.filter((c) => c.event === 'cancelled')).toHaveLength(2);
    });

    it('is scoped to the owner and a no-op on finished jobs', async () => {
      const job = await enqueueExtract();
      await expect(service.cancel('someone-else', job.id)).rejects.toThrow('Job not found');
      await service.applyEvent(event({ jobId: job.id, event: 'started' }));
      await service.applyEvent(event({ jobId: job.id, event: 'succeeded', result: {} }));
      expect((await service.cancel('user-1', job.id)).status).toBe('succeeded');
    });
  });

  describe('retry', () => {
    it('re-queues a failed job from scratch and publishes attempt 1 again', async () => {
      const job = await enqueueExtract();
      await service.applyEvent(event({ jobId: job.id, event: 'started', attempt: 1 }));
      await service.applyEvent(event({ jobId: job.id, event: 'failed', error: 'x', retryable: false }));

      const retried = await service.retry('user-1', job.id);

      expect(retried).toMatchObject({ status: 'queued', attempts: 0, error: null, progress: 0 });
      expect((queue.publishedTo(EXCHANGES.jobs).at(-1)!.message as { attempt: number }).attempt).toBe(1);
    });
  });

  describe('sweep', () => {
    it('re-publishes a running job whose heartbeat is older than the lease', async () => {
      const job = await enqueueExtract();
      await service.applyEvent(event({ jobId: job.id, event: 'started', attempt: 1, at: '2026-10-25T10:00:00.000Z' }));

      const result = await service.sweep(new Date('2026-10-25T10:20:00.000Z')); // lease 15 min

      expect(result).toEqual({ requeued: 1, failed: 0 });
      const row = (await prisma.job.findUnique({ where: { id: job.id } }))!;
      expect(row).toMatchObject({ status: 'queued', workerId: null, heartbeatAt: null });
      expect(row.error).toMatch(/worker lost/);
      expect((queue.publishedTo(EXCHANGES.jobs).at(-1)!.message as { attempt: number }).attempt).toBe(2);
    });

    it('leaves fresh jobs alone and fails a stale job that used up its attempts', async () => {
      const fresh = await enqueueExtract();
      await service.applyEvent(event({ jobId: fresh.id, event: 'started', attempt: 1, at: '2026-10-25T10:15:00.000Z' }));
      const stale = await enqueueExtract();
      await service.applyEvent(event({ jobId: stale.id, event: 'waiting', attempt: 3, at: '2026-10-25T09:00:00.000Z' }));
      await prisma.job.update({ where: { id: stale.id }, data: { attempts: 3 } });
      hookCalls = [];

      const result = await service.sweep(new Date('2026-10-25T10:20:00.000Z'));

      expect(result).toEqual({ requeued: 0, failed: 1 });
      expect((await prisma.job.findUnique({ where: { id: fresh.id } }))!.status).toBe('running');
      const failed = (await prisma.job.findUnique({ where: { id: stale.id } }))!;
      expect(failed.status).toBe('failed');
      expect(failed.error).toMatch(/after 3 attempt/);
      expect(hookCalls).toEqual([expect.objectContaining({ event: 'failed', job: expect.objectContaining({ id: stale.id }) })]);
    });
  });

  describe('queries', () => {
    it('lists the caller\'s jobs newest first with filters', async () => {
      const a = await enqueueExtract();
      const b = await service.enqueue({ type: 'reader.summarize', toolId: 'reader', userId: 'user-1', subjectType: 'book', subjectId: 'book-1', payload: {} });
      await service.enqueue({ type: 'reader.extract', toolId: 'reader', userId: 'user-2', payload: {} });

      expect((await service.list('user-1')).map((j) => j.id)).toEqual([b.id, a.id]);
      expect((await service.list('user-1', { type: 'reader.extract' })).map((j) => j.id)).toEqual([a.id]);
      expect(await service.list('user-1', { status: 'failed' })).toEqual([]);
      expect((await service.findActive({ subjectType: 'book', subjectId: 'book-1' })).length).toBe(2);
    });
  });
});
