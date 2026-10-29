import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '@platform/config/env.validation';
import { ConsumedMessage, ConsumeOutcome, QueueService } from '@platform/queue/queue.service';
import { QUEUES } from '@platform/queue/topology';
import { JobEvent, jobEventSchema } from './contracts';
import { JobsService } from './jobs.service';

export const APPLY_RETRY_DELAYS_MS = [250, 1_000, 4_000];

/**
 * Consumes q.api.job-events: validates each event and applies it to the job.
 * Up to ten deliveries are handled at once, but the events of one job are
 * applied one after the other, in the order the worker sent them.
 */
@Injectable()
export class JobEventsConsumer implements OnApplicationBootstrap {
  private readonly logger = new Logger(JobEventsConsumer.name);
  private readonly enabled: boolean;
  /** the last event of each job still being applied */
  private readonly chains = new Map<string, Promise<ConsumeOutcome>>();

  constructor(
    private readonly queue: QueueService,
    private readonly jobs: JobsService,
    config: ConfigService<EnvironmentVariables>,
  ) {
    this.enabled = (config.get('APP_MODE', { infer: true }) ?? 'all') !== 'api';
  }

  onApplicationBootstrap(): void {
    if (!this.enabled) return;
    this.queue
      .consume(QUEUES.apiEvents, (message) => this.handle(message), { prefetch: 10 })
      .catch((error: unknown) =>
        this.logger.error(`Could not subscribe to ${QUEUES.apiEvents}: ${error instanceof Error ? error.message : String(error)}`),
      );
  }

  /** Malformed events are dead-lettered; a failing transition is dead-lettered too, after logging. */
  handle(message: ConsumedMessage): Promise<ConsumeOutcome> {
    const parsed = jobEventSchema.safeParse(message.body);
    if (!parsed.success) {
      this.logger.warn(`Dropping malformed job event (${message.routingKey}): ${parsed.error.message}`);
      return Promise.resolve('reject');
    }
    const event = parsed.data;
    const previous = this.chains.get(event.jobId) ?? Promise.resolve<ConsumeOutcome>('ack');
    const run = previous.then(() => this.apply(event));
    this.chains.set(event.jobId, run);
    void run.finally(() => {
      if (this.chains.get(event.jobId) === run) this.chains.delete(event.jobId);
    });
    return run;
  }

  /** A transition that fails (the database blinked) is tried again a few times before the event is given up. */
  private async apply(event: JobEvent, retryDelaysMs: readonly number[] = APPLY_RETRY_DELAYS_MS): Promise<ConsumeOutcome> {
    for (let attempt = 0; ; attempt++) {
      try {
        const job = await this.jobs.applyEvent(event);
        this.logger.debug(
          `${event.event} ${event.jobId}${event.stage ? ` [${event.stage}]` : ''}${
            job ? ` -> ${job.status}` : ' (unknown job)'
          }`,
        );
        return 'ack';
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (attempt >= retryDelaysMs.length) {
          this.logger.error(`Could not apply ${event.event} to job ${event.jobId}: ${message}`);
          return 'reject';
        }
        this.logger.warn(`Applying ${event.event} to job ${event.jobId} failed (${message}); trying again`);
        await new Promise((resolve) => setTimeout(resolve, retryDelaysMs[attempt]));
      }
    }
  }
}
