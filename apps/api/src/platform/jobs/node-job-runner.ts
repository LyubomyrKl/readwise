import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from '@prisma/client';
import { hostname } from 'os';
import { EnvironmentVariables } from '@platform/config/env.validation';
import { ConsumedMessage, ConsumeOutcome, QueueService } from '@platform/queue/queue.service';
import { EXCHANGES, QUEUES, jobRoutingKey } from '@platform/queue/topology';
import { JobEnvelope, JobEvent, jobEnvelopeSchema } from './contracts';
import { JobsService } from './jobs.service';

export interface NodeJobContext {
  envelope: JobEnvelope;
  payload: Record<string, unknown>;
  progress(stage: string, progress?: number): Promise<void>;
  waiting(reason: string, stage?: string): Promise<void>;
}

/** Returns the job result (stored on the row) or nothing. Throw to fail the job. */
export type NodeJobHandler = (ctx: NodeJobContext) => Promise<Record<string, unknown> | void>;

/** A handler can throw this to fail without a retry. */
export class NonRetryableJobError extends Error {}

/**
 * Runs job handlers that live in the API code base. Tool modules register
 * handlers in onModuleInit; the runner binds their routing keys to
 * q.node.default and consumes it. Same semantics as the Python workers:
 * acknowledge on claim, report through JobsService.applyEvent, one job at a time.
 */
@Injectable()
export class NodeJobRunner implements OnApplicationBootstrap {
  private readonly logger = new Logger(NodeJobRunner.name);
  private readonly handlers = new Map<string, NodeJobHandler>();
  private readonly enabled: boolean;
  private readonly workerId = `api-${hostname()}-${process.pid}`;
  private tail: Promise<void> = Promise.resolve();

  constructor(
    private readonly queue: QueueService,
    private readonly jobs: JobsService,
    config: ConfigService<EnvironmentVariables>,
  ) {
    this.enabled = (config.get('APP_MODE', { infer: true }) ?? 'all') !== 'api';
  }

  registerHandler(type: string, handler: NodeJobHandler): void {
    if (this.handlers.has(type)) {
      throw new Error(`A handler for ${type} is already registered`);
    }
    this.handlers.set(type, handler);
  }

  get registeredTypes(): string[] {
    return [...this.handlers.keys()];
  }

  onApplicationBootstrap(): void {
    if (!this.enabled || this.handlers.size === 0) return;
    void (async () => {
      for (const type of this.handlers.keys()) {
        await this.queue.bindQueue(QUEUES.nodeDefault, EXCHANGES.jobs, jobRoutingKey(type));
      }
      await this.queue.consume(QUEUES.nodeDefault, (message) => this.claim(message), { prefetch: 1 });
      this.logger.log(`Node runner handles: ${this.registeredTypes.join(', ')}`);
    })().catch((error: unknown) =>
      this.logger.error(`Node runner failed to start: ${error instanceof Error ? error.message : String(error)}`),
    );
  }

  /** Acknowledges immediately and runs the job after the previous one finished. */
  claim(message: ConsumedMessage): Promise<ConsumeOutcome> {
    const parsed = jobEnvelopeSchema.safeParse(message.body);
    if (!parsed.success) {
      this.logger.warn(`Dropping malformed job envelope: ${parsed.error.message}`);
      return Promise.resolve('reject');
    }
    const envelope = parsed.data;
    if (!this.handlers.has(envelope.type)) {
      this.logger.warn(`No handler for ${envelope.type} (job ${envelope.jobId})`);
      return Promise.resolve('reject');
    }
    this.tail = this.tail.then(
      () => this.run(envelope).then(() => undefined),
      () => undefined,
    );
    return Promise.resolve('ack');
  }

  async run(envelope: JobEnvelope): Promise<Job | null> {
    const handler = this.handlers.get(envelope.type)!;
    const event = (partial: Omit<JobEvent, 'v' | 'jobId' | 'at' | 'workerId'>): JobEvent => ({
      v: 1,
      jobId: envelope.jobId,
      at: new Date().toISOString(),
      workerId: this.workerId,
      ...partial,
    });

    const started = await this.jobs.applyEvent(event({ event: 'started', attempt: envelope.attempt }));
    if (!started || started.status !== 'running') {
      this.logger.warn(`Job ${envelope.jobId} not started (status ${started?.status ?? 'unknown'})`);
      return started;
    }

    const ctx: NodeJobContext = {
      envelope,
      payload: envelope.payload,
      progress: async (stage, progress) => {
        await this.jobs.applyEvent(event({ event: 'progress', stage, progress }));
      },
      waiting: async (reason, stage) => {
        await this.jobs.applyEvent(event({ event: 'waiting', reason, stage }));
      },
    };

    try {
      const result = await handler(ctx);
      return await this.jobs.applyEvent(event({ event: 'succeeded', result: result ?? null, progress: 100 }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return await this.jobs.applyEvent(
        event({ event: 'failed', error: message, retryable: !(error instanceof NonRetryableJobError) }),
      );
    }
  }
}
