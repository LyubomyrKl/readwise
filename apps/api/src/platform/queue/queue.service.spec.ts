/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
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
    await setup(channel);
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
});
