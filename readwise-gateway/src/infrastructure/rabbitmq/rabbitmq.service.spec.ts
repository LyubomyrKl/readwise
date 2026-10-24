import { ConfigService } from '@nestjs/config';
import { SummarizationStrategy, SummaryType } from '@prisma/client';

const mockSendToQueue = jest.fn();
const mockChannelWrapper = {
  sendToQueue: mockSendToQueue,
  on: jest.fn(),
  close: jest.fn().mockResolvedValue(undefined),
};
const mockConnect = jest.fn((..._args: unknown[]) => ({
  createChannel: jest.fn(() => mockChannelWrapper),
  on: jest.fn(),
  close: jest.fn().mockResolvedValue(undefined),
  isConnected: jest.fn(() => true),
}));

jest.mock('amqp-connection-manager', () => ({
  connect: (...args: unknown[]) => mockConnect(...args),
}));

import { RabbitMQService } from './rabbitmq.service';

type PublishedCall = [string, Record<string, unknown>, Record<string, unknown>];

/**
 * Contract tripwire. The message published here is consumed by the Python
 * extraction worker (readwise-workers/workers/extraction-worker/main.py), which
 * must forward every summary option to the summarization worker. The Python
 * side asserts the same field names in
 * readwise-workers/tests/test_extraction_forwarding.py.
 */
describe('RabbitMQService', () => {
  const env: Record<string, string> = {
    RABBITMQ_HOST: 'rabbit.test',
    RABBITMQ_USER: 'user',
    RABBITMQ_PASS: 'pass',
  };
  const config = {
    get: jest.fn((key: string) => env[key]),
  } as unknown as ConfigService;

  let service: RabbitMQService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSendToQueue.mockResolvedValue(true);
    service = new RabbitMQService(config);
  });

  it('connects with credentials from configuration', () => {
    expect(mockConnect).toHaveBeenCalledWith(
      ['amqp://user:pass@rabbit.test:5672'],
      expect.objectContaining({ heartbeatIntervalInSeconds: 30 }),
    );
  });

  it('publishes a durable summary request carrying type and strategy to extract_request', async () => {
    const result = await service.publishSummaryRequest(
      'user-1',
      'book-1',
      SummaryType.abstractive,
      SummarizationStrategy.two_pass,
    );

    expect(result).toEqual({
      success: true,
      message: 'Summary request queued successfully',
    });
    expect(mockSendToQueue).toHaveBeenCalledTimes(1);

    const [queue, message, options] = mockSendToQueue.mock
      .calls[0] as PublishedCall;
    expect(queue).toBe('extract_request');
    expect(message).toMatchObject({
      type: 'summary_request',
      version: 1,
      userId: 'user-1',
      bookId: 'book-1',
      summarizationType: 'abstractive',
      summarizationStrategy: 'two_pass',
      autoSummarize: true,
    });
    expect(typeof message.messageId).toBe('string');
    expect(typeof message.summaryPercent).toBe('number');
    expect(typeof message.requestedAt).toBe('string');
    expect(options).toMatchObject({
      persistent: true,
      contentType: 'application/json',
      type: 'summary_request',
    });
  });

  it('defaults the strategy to structured when none is given', async () => {
    await service.publishSummaryRequest(
      'user-1',
      'book-1',
      SummaryType.extractive,
    );

    const [, message] = mockSendToQueue.mock.calls[0] as PublishedCall;
    expect(message.summarizationStrategy).toBe('structured');
    expect(message.summarizationType).toBe('extractive');
  });

  it('propagates publish failures to the caller', async () => {
    mockSendToQueue.mockRejectedValueOnce(new Error('broker unavailable'));

    await expect(
      service.publishSummaryRequest('user-1', 'book-1', SummaryType.extractive),
    ).rejects.toThrow('broker unavailable');
  });
});
