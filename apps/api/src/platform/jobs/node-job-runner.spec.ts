import { NodeJobRunner, NonRetryableJobError } from './node-job-runner';
import { JobsService } from './jobs.service';
import { JobEvent } from './contracts';
import { FakeQueue, fakeConfig } from '../../../test/fakes/fake-prisma';

describe('NodeJobRunner', () => {
  const events: JobEvent[] = [];
  const jobs = {
    applyEvent: jest.fn(async (e: JobEvent) => {
      events.push(e);
      return { id: e.jobId, status: e.event === 'started' ? 'running' : e.event } as never;
    }),
  } as unknown as JobsService;
  const envelope = {
    v: 1 as const,
    jobId: 'job-1',
    type: 'demo.echo',
    toolId: 'demo',
    userId: 'user-1',
    attempt: 1,
    publishedAt: '2026-10-25T10:00:00.000Z',
    payload: { text: 'hi' },
  };

  beforeEach(() => {
    events.length = 0;
    jest.clearAllMocks();
  });

  it('runs a registered handler: started, progress, succeeded with the result', async () => {
    const runner = new NodeJobRunner(new FakeQueue() as never, jobs, fakeConfig() as never);
    runner.registerHandler('demo.echo', async (ctx) => {
      await ctx.progress('echoing', 50);
      return { echoed: ctx.payload.text };
    });

    await runner.run(envelope);

    expect(events.map((e) => e.event)).toEqual(['started', 'progress', 'succeeded']);
    expect(events[0]).toMatchObject({ jobId: 'job-1', attempt: 1 });
    expect(events[1]).toMatchObject({ stage: 'echoing', progress: 50 });
    expect(events[2]).toMatchObject({ result: { echoed: 'hi' }, progress: 100 });
  });

  it('turns a thrown error into a retryable failure, NonRetryableJobError into a final one', async () => {
    const runner = new NodeJobRunner(new FakeQueue() as never, jobs, fakeConfig() as never);
    runner.registerHandler('demo.echo', async () => {
      throw new Error('flaky');
    });
    await runner.run(envelope);
    expect(events.at(-1)).toMatchObject({ event: 'failed', error: 'flaky', retryable: true });

    const strict = new NodeJobRunner(new FakeQueue() as never, jobs, fakeConfig() as never);
    strict.registerHandler('demo.echo', async () => {
      throw new NonRetryableJobError('bad input');
    });
    await strict.run(envelope);
    expect(events.at(-1)).toMatchObject({ event: 'failed', error: 'bad input', retryable: false });
  });

  it('does not run when the job could not be started (e.g. cancelled meanwhile)', async () => {
    const handler = jest.fn();
    const cancelledJobs = { applyEvent: jest.fn().mockResolvedValue({ status: 'cancelled' }) } as unknown as JobsService;
    const runner = new NodeJobRunner(new FakeQueue() as never, cancelledJobs, fakeConfig() as never);
    runner.registerHandler('demo.echo', handler);

    await runner.run(envelope);

    expect(handler).not.toHaveBeenCalled();
  });

  it('acknowledges on claim and rejects envelopes it cannot handle', async () => {
    const runner = new NodeJobRunner(new FakeQueue() as never, jobs, fakeConfig() as never);
    runner.registerHandler('demo.echo', async () => ({}));

    await expect(runner.claim({ body: envelope, routingKey: 'jobs.demo.echo', raw: {} as never })).resolves.toBe('ack');
    await expect(runner.claim({ body: { ...envelope, type: 'demo.other' }, routingKey: '', raw: {} as never })).resolves.toBe('reject');
    await expect(runner.claim({ body: { nope: true }, routingKey: '', raw: {} as never })).resolves.toBe('reject');
  });

  it('binds its routing keys and consumes the node queue on bootstrap, except in api mode', async () => {
    const queue = new FakeQueue();
    const runner = new NodeJobRunner(queue as never, jobs, fakeConfig() as never);
    runner.registerHandler('demo.echo', async () => ({}));
    runner.onApplicationBootstrap();
    await new Promise((r) => setImmediate(r));
    expect(queue.bindings).toEqual([{ queue: 'q.node.default', exchange: 'workbench.jobs', pattern: 'jobs.demo.echo' }]);
    expect(queue.consume).toHaveBeenCalledWith('q.node.default', expect.any(Function), { prefetch: 1 });

    const apiQueue = new FakeQueue();
    const apiOnly = new NodeJobRunner(apiQueue as never, jobs, fakeConfig({ APP_MODE: 'api' }) as never);
    apiOnly.registerHandler('demo.echo', async () => ({}));
    apiOnly.onApplicationBootstrap();
    await new Promise((r) => setImmediate(r));
    expect(apiQueue.consume).not.toHaveBeenCalled();
  });
});
