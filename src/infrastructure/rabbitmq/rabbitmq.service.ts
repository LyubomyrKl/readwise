import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SummaryType } from '@prisma/client';
import * as amqp from 'amqp-connection-manager';
import { ConfirmChannel } from 'amqplib';
import { randomUUID } from 'crypto';

type SummaryRequestMessage = {
  messageId: string;
  type: 'summary_request';
  summaryPercent: number;
  summarizationType: SummaryType;
  version: 1;
  userId: string;
  bookId: string;
  requestedAt: string; // ISO8601
};

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQService.name);

  private connection: amqp.AmqpConnectionManager;
  private channelWrapper: amqp.ChannelWrapper;

  private readonly extractionQueueName = 'extract_request';

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('RABBITMQ_HOST') || 'localhost';
    const port = this.config.get<string>('RABBITMQ_PORT') || '5672';
    const user = this.config.get<string>('RABBITMQ_USER') || 'guest';
    const pass = this.config.get<string>('RABBITMQ_PASS') || 'guest';

    const url = `amqp://${user}:${pass}@${host}:${port}`;

    this.logger.log(`RabbitMQService constructor - connecting to: ${url}`);

    this.connection = amqp.connect([url], {
      heartbeatIntervalInSeconds: 30,
      reconnectTimeInSeconds: 2,
    });

    this.channelWrapper = this.connection.createChannel({
      json: true,
      setup: (channel: ConfirmChannel) => {
        this.logger.log('Setting up RabbitMQ channel and asserting queue');
        return channel.assertQueue(this.extractionQueueName, {
          durable: true,
        });
      },
    });

    this.logger.log('RabbitMQService constructor completed');
  }

  onModuleInit(): void {
    this.connection.on('connect', () => {
      this.logger.log('Connected to RabbitMQ');
    });

    this.connection.on('disconnect', ({ err }) => {
      this.logger.warn('Disconnected from RabbitMQ', err?.message);
    });

    this.channelWrapper.on('connect', () => {
      this.logger.log('RabbitMQ channel connected');
    });

    this.channelWrapper.on('error', (err) => {
      this.logger.error('RabbitMQ channel error', err.message);
    });

    this.channelWrapper.on('close', () => {
      this.logger.warn('RabbitMQ channel closed');
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.channelWrapper.close();
    await this.connection.close();
    this.logger.log('RabbitMQ connection closed');
  }

  async publishSummaryRequest(
    userId: string,
    bookId: string,
  ): Promise<{ success: boolean; message: string }> {
    const message: SummaryRequestMessage = {
      messageId: randomUUID(),
      type: 'summary_request',
      version: 1,
      userId,
      summaryPercent: 40,
      bookId,
      summarizationType: 'abstractive',
      requestedAt: new Date().toISOString(),
    };

    try {
      this.logger.log(
        `Attempting to queue summary request for user ${userId}, book ${bookId}`,
      );

      const result = await this.channelWrapper.sendToQueue(
        this.extractionQueueName,
        message,
        {
          persistent: true,
          contentType: 'application/json',
          messageId: message.messageId,
          type: message.type,
          timestamp: Date.now(),
        },
      );

      this.logger.log(`SendToQueue returned: ${result}`);
      this.logger.log(
        `Summary request queued for user ${userId}, book ${bookId}`,
      );
      return { success: true, message: 'Summary request queued successfully' };
    } catch (error) {
      this.logger.error('Failed to publish summary request', error);
      throw error;
    }
  }

  isConnected(): boolean {
    return this.connection.isConnected();
  }
}
