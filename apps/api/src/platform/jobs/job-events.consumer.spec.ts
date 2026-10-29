import { JobEventsConsumer } from './job-events.consumer';
import { JobsService } from './jobs.service';
import { FakeQueue, fakeConfig } from '../../../test/fakes/fake-prisma';

describe('JobEventsConsumer', () => {
  const jobs = { applyEvent: jest.fn() } as unknown as JobsService & { applyEvent: jest.Mock };
  const message = (body: unknown) => ({ body, routingKey: 'job.progress', raw: {} as never });
  const valid = { v: 1, jobId: 'job-1', event: 'progress', at: '2026-10-25T10:00:00.000Z', workerId: 'w', stage: 's', progress: 5 };

  beforeEach(() => jest.clearAllMocks());

  it('applies a valid event and acknowledges', async () => {
    jobs.applyEvent.mockResolvedValue({ status: 'running' });
    const consumer = new JobEventsConsumer(new FakeQueue() as never, jobs, fakeConfig() as never);

    await expect(consumer.handle(message(valid))).resolves.toBe('ack');
    expect(jobs.applyEvent).toHaveBeenCalledWith(valid);
  });

  it('dead-letters malformed events without touching the job', async () => {
    const consumer = new JobEventsConsumer(new FakeQueue() as never, jobs, fakeConfig() as never);

    await expect(consumer.handle(message({ ...valid, event: 'done' }))).resolves.toBe('reject');
    await expect(consumer.handle(message(undefined))).resolves.toBe('reject');
    await expect(consumer.handle(message({ ...valid, bookId: 'extra' }))).resolves.toBe('reject');
    expect(jobs.applyEvent).not.toHaveBeenCalled();
  });

  it('tries a failing transition again, and dead-letters the event only when it keeps failing', async () => {
    jest.useFakeTimers();
    try {
      const consumer = new JobEventsConsumer(new FakeQueue() as never, jobs, fakeConfig() as never);
      jobs.applyEvent.mockRejectedValueOnce(new Error('db blinked')).mockResolvedValueOnce({ status: 'running' });
      const recovered = consumer.handle(message(valid));
      await jest.runAllTimersAsync();
      await expect(recovered).resolves.toBe('ack');

      jobs.applyEvent.mockRejectedValue(new Error('db down'));
      const lost = consumer.handle(message(valid));
      await jest.runAllTimersAsync();
      await expect(lost).resolves.toBe('reject');
      expect(jobs.applyEvent).toHaveBeenCalledTimes(2 + 4);
    } finally {
      jest.useRealTimers();
    }
  });

  it('applies the events of one job in the order they came, other jobs alongside', async () => {
    const applied: string[] = [];
    jobs.applyEvent.mockImplementation(async (e: { jobId: string; event: string }) => {
      // the first event of job-1 is slow; without ordering, succeeded would land first
      if (e.jobId === 'job-1' && e.event === 'started') await new Promise((r) => setTimeout(r, 20));
      applied.push(`${e.jobId}:${e.event}`);
      return { status: 'running' };
    });
    const consumer = new JobEventsConsumer(new FakeQueue() as never, jobs, fakeConfig() as never);
    await Promise.all([
      consumer.handle(message({ ...valid, event: 'started' })),
      consumer.handle(message({ ...valid, jobId: 'job-2' })),
      consumer.handle(message({ ...valid, event: 'succeeded' })),
    ]);
    expect(applied).toEqual(['job-2:progress', 'job-1:started', 'job-1:succeeded']);
  });

  it('subscribes to the events queue unless APP_MODE=api', () => {
    const queue = new FakeQueue();
    new JobEventsConsumer(queue as never, jobs, fakeConfig({ APP_MODE: 'api' }) as never).onApplicationBootstrap();
    expect(queue.consume).not.toHaveBeenCalled();

    new JobEventsConsumer(queue as never, jobs, fakeConfig({ APP_MODE: 'worker' }) as never).onApplicationBootstrap();
    expect(queue.consume).toHaveBeenCalledWith('q.api.job-events', expect.any(Function), { prefetch: 10 });
  });
});
