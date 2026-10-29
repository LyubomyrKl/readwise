import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage, Options } from 'amqplib';
import { EnvironmentVariables } from '@platform/config/env.validation';
import {
  EXCHANGES,
  LEGACY_QUEUES,
  PYTHON_JOB_TYPES,
  QUEUES,
  dlqOf,
  jobRoutingKey,
  pythonQueueFor,
  workQueueArguments,
} from './topology';

export type ConsumeOutcome = 'ack' | 'reject';

export interface ConsumedMessage {
  /** Parsed JSON body, or undefined when the body is not valid JSON. */
  body: unknown;
  routingKey: string;
  raw: ConsumeMessage;
}

export type ConsumeHandler = (message: ConsumedMessage) => Promise<ConsumeOutcome>;

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  // a failed topology is reported by the setup that ran it; waiting setups see it too
  promise.catch(() => undefined);
  return { promise, resolve, reject };
}

/**
 * Thin wrapper over amqp-connection-manager: one connection, one confirm
 * channel, the topology asserted on every (re)connect, JSON in and out.
 *
 * The library runs every setup function of a (re)connect at the same time, so
 * a bind or a consume requested before the first connect would reach the
 * broker before the topology declared its queue (404, channel closed, again
 * on every reconnect). Binds and consumes therefore wait for the topology of
 * the channel they run on.
 */
@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly connection: amqp.AmqpConnectionManager;
  private readonly channel: amqp.ChannelWrapper;
  /** Per channel: settled once the topology was asserted on it. */
  private readonly topology = new WeakMap<ConfirmChannel, Deferred>();

  constructor(config: ConfigService<EnvironmentVariables>) {
    const host = config.get('RABBITMQ_HOST', { infer: true })!;
    const port = config.get('RABBITMQ_PORT', { infer: true }) ?? '5672';
    const user = config.get('RABBITMQ_USER', { infer: true })!;
    const pass = config.get('RABBITMQ_PASS', { infer: true })!;
    const url = `amqp://${user}:${pass}@${host}:${port}`;

    this.connection = amqp.connect([url], {
      heartbeatIntervalInSeconds: 30,
      reconnectTimeInSeconds: 2,
    });
    this.channel = this.connection.createChannel({
      json: true,
      setup: (channel: ConfirmChannel) => this.setupTopology(channel),
    });
  }

  onModuleInit(): void {
    this.connection.on('connect', () => this.logger.log('Connected to RabbitMQ'));
    this.connection.on('disconnect', ({ err }) =>
      this.logger.warn(`Disconnected from RabbitMQ: ${err?.message ?? 'unknown reason'}`),
    );
    this.channel.on('error', (err: Error) => this.logger.error(`RabbitMQ channel error: ${err.message}`));
    this.channel.on('close', () => this.logger.warn('RabbitMQ channel closed'));
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel.close();
    await this.connection.close();
  }

  isConnected(): boolean {
    return this.connection.isConnected();
  }

  /** Publishes a JSON message (persistent) and resolves once the broker confirmed it. */
  async publish(
    exchange: string,
    routingKey: string,
    message: object,
    options: Options.Publish = {},
  ): Promise<void> {
    await this.channel.publish(exchange, routingKey, message, {
      persistent: true,
      contentType: 'application/json',
      timestamp: Date.now(),
      ...options,
    });
  }

  /**
   * Consumes a queue. The handler decides: 'ack' or 'reject' (dead-lettered,
   * never requeued). The subscription is re-established after a reconnect.
   */
  async consume(queue: string, handler: ConsumeHandler, opts: { prefetch?: number } = {}): Promise<void> {
    await this.channel.addSetup(async (channel: ConfirmChannel) => {
      await this.topologyOf(channel).promise;
      await channel.prefetch(opts.prefetch ?? 1);
      await channel.consume(
        queue,
        (raw) => {
          if (!raw) return;
          void this.dispatch(channel, raw, handler);
        },
        { noAck: false },
      );
      this.logger.log(`Consuming ${queue}`);
    });
  }

  /** Binds an extra routing key to a queue (used by the Node runner for registered handlers). */
  async bindQueue(queue: string, exchange: string, pattern: string): Promise<void> {
    await this.channel.addSetup(async (channel: ConfirmChannel) => {
      await this.topologyOf(channel).promise;
      await channel.bindQueue(queue, exchange, pattern);
    });
  }

  private topologyOf(channel: ConfirmChannel): Deferred {
    let state = this.topology.get(channel);
    if (!state) {
      state = deferred();
      this.topology.set(channel, state);
    }
    return state;
  }

  private async setupTopology(channel: ConfirmChannel): Promise<void> {
    const state = this.topologyOf(channel);
    try {
      await this.assertTopology(channel);
      state.resolve();
    } catch (error) {
      state.reject(error);
      throw error;
    }
  }

  private async dispatch(channel: ConfirmChannel, raw: ConsumeMessage, handler: ConsumeHandler): Promise<void> {
    let body: unknown;
    try {
      body = JSON.parse(raw.content.toString('utf-8'));
    } catch {
      body = undefined;
    }
    let outcome: ConsumeOutcome;
    try {
      outcome = await handler({ body, routingKey: raw.fields.routingKey, raw });
    } catch (error) {
      this.logger.error(
        `Handler for ${raw.fields.routingKey} threw: ${error instanceof Error ? error.message : String(error)}`,
      );
      outcome = 'reject';
    }
    try {
      if (outcome === 'ack') channel.ack(raw);
      else channel.nack(raw, false, false);
    } catch (error) {
      // the channel went away in the meantime; the broker redelivers
      this.logger.warn(`Could not ${outcome} message: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async assertTopology(channel: ConfirmChannel): Promise<void> {
    await channel.assertExchange(EXCHANGES.jobs, 'topic', { durable: true });
    await channel.assertExchange(EXCHANGES.events, 'topic', { durable: true });
    await channel.assertExchange(EXCHANGES.control, 'fanout', { durable: true });
    await channel.assertExchange(EXCHANGES.dlx, 'direct', { durable: true });

    const workQueues: Array<{ queue: string; exchange: string; bindings: string[] }> = [
      { queue: QUEUES.apiEvents, exchange: EXCHANGES.events, bindings: ['job.#'] },
      { queue: QUEUES.nodeDefault, exchange: EXCHANGES.jobs, bindings: [] },
      ...Object.entries(PYTHON_JOB_TYPES).map(([toolId, types]) => ({
        queue: pythonQueueFor(toolId),
        exchange: EXCHANGES.jobs,
        bindings: types.map(jobRoutingKey),
      })),
    ];

    for (const { queue, exchange, bindings } of workQueues) {
      await channel.assertQueue(dlqOf(queue), { durable: true });
      await channel.bindQueue(dlqOf(queue), EXCHANGES.dlx, queue);
      await channel.assertQueue(queue, { durable: true, arguments: workQueueArguments(queue) });
      for (const pattern of bindings) {
        await channel.bindQueue(queue, exchange, pattern);
      }
    }

    for (const legacy of LEGACY_QUEUES) {
      try {
        const { messageCount } = await channel.deleteQueue(legacy);
        if (messageCount > 0) {
          this.logger.warn(`Deleted pre-Phase-4 queue ${legacy} with ${messageCount} message(s)`);
        }
      } catch {
        // the queue does not exist (deleteQueue on a missing queue closes the channel on
        // some brokers; RabbitMQ 3.x treats it as a no-op)
      }
    }
    this.logger.log('RabbitMQ topology asserted');
  }
}
