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

  it('dead-letters an event whose transition throws', async () => {
    jobs.applyEvent.mockRejectedValue(new Error('db down'));
    const consumer = new JobEventsConsumer(new FakeQueue() as never, jobs, fakeConfig() as never);

    await expect(consumer.handle(message(valid))).resolves.toBe('reject');
  });

  it('subscribes to the events queue unless APP_MODE=api', () => {
    const queue = new FakeQueue();
    new JobEventsConsumer(queue as never, jobs, fakeConfig({ APP_MODE: 'api' }) as never).onApplicationBootstrap();
    expect(queue.consume).not.toHaveBeenCalled();

    new JobEventsConsumer(queue as never, jobs, fakeConfig({ APP_MODE: 'worker' }) as never).onApplicationBootstrap();
    expect(queue.consume).toHaveBeenCalledWith('q.api.job-events', expect.any(Function), { prefetch: 10 });
  });
});
