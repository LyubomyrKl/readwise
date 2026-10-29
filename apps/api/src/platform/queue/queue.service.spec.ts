import { fakeConfig } from '../../../test/fakes/fake-prisma';

const mockPublish = jest.fn();
const mockAddSetup = jest.fn();
let channelSetup: ((channel: any) => Promise<void>) | undefined;
const mockChannelWrapper = {
  publish: mockPublish,
  addSetup: mockAddSetup,
  on: jest.fn(),
  close: jest.fn().mockResolvedValue(undefined),
};
const mockConnect = jest.fn((..._args: unknown[]) => ({
  createChannel: jest.fn((opts: { setup: (channel: any) => Promise<void> }) => {
    channelSetup = opts.setup;
    return mockChannelWrapper;
  }),
  on: jest.fn(),
  close: jest.fn().mockResolvedValue(undefined),
  isConnected: jest.fn(() => true),
}));

jest.mock('amqp-connection-manager', () => ({
  connect: (...args: unknown[]) => mockConnect(...args),
}));

import { QueueService } from './queue.service';
import { EXCHANGES } from './topology';

function fakeChannel() {
  return {
    assertExchange: jest.fn().mockResolvedValue({}),
    assertQueue: jest.fn().mockResolvedValue({}),
    bindQueue: jest.fn().mockResolvedValue({}),
    deleteQueue: jest.fn().mockResolvedValue({ messageCount: 0 }),
    prefetch: jest.fn().mockResolvedValue(undefined),
    consume: jest.fn().mockResolvedValue({ consumerTag: 't' }),
    ack: jest.fn(),
    nack: jest.fn(),
  };
}

describe('QueueService', () => {
  let service: QueueService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPublish.mockResolvedValue(true);
    service = new QueueService(fakeConfig() as never);
  });

  it('connects with host, port and credentials from configuration', () => {
    expect(mockConnect).toHaveBeenCalledWith(
      ['amqp://user:pass@rabbit.test:5672'],
      expect.objectContaining({ heartbeatIntervalInSeconds: 30 }),
    );
  });

  it('asserts the topology: exchanges, work queues with dead-letter queues, bindings; drops the legacy queues', async () => {
    const channel = fakeChannel();
    await channelSetup!(channel);

    expect(channel.assertExchange).toHaveBeenCalledWith('workbench.jobs', 'topic', { durable: true });
    expect(channel.assertExchange).toHaveBeenCalledWith('workbench.job-events', 'topic', { durable: true });
    expect(channel.assertExchange).toHaveBeenCalledWith('workbench.job-control', 'fanout', { durable: true });
    expect(channel.assertExchange).toHaveBeenCalledWith('workbench.dlx', 'direct', { durable: true });

    for (const queue of ['q.api.job-events', 'q.node.default', 'q.py.reader']) {
      expect(channel.assertQueue).toHaveBeenCalledWith(queue, {
        durable: true,
        arguments: { 'x-dead-letter-exchange': 'workbench.dlx', 'x-dead-letter-routing-key': queue },
      });
      expect(channel.assertQueue).toHaveBeenCalledWith(`${queue}.dlq`, { durable: true });
      expect(channel.bindQueue).toHaveBeenCalledWith(`${queue}.dlq`, 'workbench.dlx', queue);
    }
    expect(channel.bindQueue).toHaveBeenCalledWith('q.py.reader', 'workbench.jobs', 'jobs.reader.extract');
    expect(channel.bindQueue).toHaveBeenCalledWith('q.py.reader', 'workbench.jobs', 'jobs.reader.summarize');
    expect(channel.bindQueue).toHaveBeenCalledWith('q.api.job-events', 'workbench.job-events', 'job.#');
    expect(channel.deleteQueue).toHaveBeenCalledWith('extract_request');
    expect(channel.deleteQueue).toHaveBeenCalledWith('summary_request');
  });

  it('publishes persistent JSON with the given routing key and merges options', async () => {
    await service.publish(EXCHANGES.jobs, 'jobs.reader.extract', { v: 1 }, { messageId: 'job-1' });

    expect(mockPublish).toHaveBeenCalledWith(
      'workbench.jobs',
      'jobs.reader.extract',
      { v: 1 },
      expect.objectContaining({ persistent: true, contentType: 'application/json', messageId: 'job-1' }),
    );
  });

  it('propagates publish failures', async () => {
    mockPublish.mockRejectedValueOnce(new Error('broker unavailable'));
    await expect(service.publish(EXCHANGES.jobs, 'k', {})).rejects.toThrow('broker unavailable');
  });

  it('consume parses JSON, acks on "ack" and dead-letters on "reject" or a thrown handler', async () => {
    const outcomes: Array<'ack' | 'reject'> = [];
    const handler = jest.fn(async (m: { body: unknown }) => {
      if (m.body === undefined) return 'reject' as const;
      if ((m.body as { boom?: boolean }).boom) throw new Error('boom');
      outcomes.push('ack');
      return 'ack' as const;
    });
    await service.consume('q.api.job-events', handler, { prefetch: 7 });
    const setup = mockAddSetup.mock.calls[0][0];
    const channel = fakeChannel();
    await Promise.all([channelSetup!(channel), setup(channel)]);
    expect(channel.prefetch).toHaveBeenCalledWith(7);
    const onMessage = channel.consume.mock.calls[0][1];
    const raw = (content: string) => ({ content: Buffer.from(content), fields: { routingKey: 'job.progress' } });

    onMessage(raw('{"ok":true}'));
    onMessage(raw('not json'));
    onMessage(raw('{"boom":true}'));
    await new Promise((r) => setImmediate(r));

    expect(channel.ack).toHaveBeenCalledTimes(1);
    expect(channel.nack).toHaveBeenCalledTimes(2);
    expect(channel.nack).toHaveBeenCalledWith(expect.anything(), false, false);
  });

  /** A broker double: binding or consuming a queue that was not declared yet fails like RabbitMQ (404). */
  function brokerChannel(log: string[]) {
    const declared = new Set<string>();
    const later = () => new Promise<void>((r) => setImmediate(r));
    return {
      ...fakeChannel(),
      assertExchange: jest.fn(async () => {
        await later();
        return {};
      }),
      assertQueue: jest.fn(async (queue: string) => {
        await later();
        declared.add(queue);
        log.push(`assert ${queue}`);
        return {};
      }),
      bindQueue: jest.fn(async (queue: string, _exchange: string, pattern: string) => {
        if (!declared.has(queue)) throw new Error(`NOT_FOUND - no queue '${queue}' in vhost '/'`);
        log.push(`bind ${queue} ${pattern}`);
        return {};
      }),
      consume: jest.fn(async (queue: string) => {
        if (!declared.has(queue)) throw new Error(`NOT_FOUND - no queue '${queue}' in vhost '/'`);
        log.push(`consume ${queue}`);
        return { consumerTag: 't' };
      }),
    };
  }

  it('binds and consumes requested before the first connect wait for the topology, which the library runs at the same time', async () => {
    const log: string[] = [];
    const channel = brokerChannel(log);
    await service.bindQueue('q.node.default', EXCHANGES.jobs, 'jobs.money.rates');
    await service.consume('q.node.default', jest.fn(), { prefetch: 1 });
    await service.consume('q.api.job-events', jest.fn(), { prefetch: 10 });
    const setups = mockAddSetup.mock.calls.map((call) => call[0]);

    // amqp-connection-manager: Promise.all over every setup function, the topology among them
    await Promise.all([channelSetup!(channel), ...setups.map((setup) => setup(channel))]);

    expect(log.indexOf('bind q.node.default jobs.money.rates')).toBeGreaterThan(log.indexOf('assert q.node.default'));
    expect(log.indexOf('consume q.node.default')).toBeGreaterThan(log.indexOf('assert q.node.default'));
    expect(log.indexOf('consume q.api.job-events')).toBeGreaterThan(log.indexOf('assert q.api.job-events'));
    expect(channel.consume).toHaveBeenCalledTimes(2);
  });

  it('a bind or consume added once connected runs at once, after the topology of that channel', async () => {
    const log: string[] = [];
    const channel = brokerChannel(log);
    await channelSetup!(channel);
    await service.bindQueue('q.node.default', EXCHANGES.jobs, 'jobs.money.prices');
    await mockAddSetup.mock.calls[0][0](channel);
    expect(log[log.length - 1]).toBe('bind q.node.default jobs.money.prices');
  });

  it('waiting setups fail with the topology instead of hanging', async () => {
    const channel = { ...fakeChannel(), assertExchange: jest.fn().mockRejectedValue(new Error('ACCESS_REFUSED')) };
    await service.consume('q.api.job-events', jest.fn(), { prefetch: 10 });
    const setup = mockAddSetup.mock.calls[0][0];
    const results = await Promise.allSettled([channelSetup!(channel), setup(channel)]);
    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected']);
    expect(channel.consume).not.toHaveBeenCalled();
  });
});
