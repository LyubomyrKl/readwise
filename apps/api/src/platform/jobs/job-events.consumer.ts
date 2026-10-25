import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '@platform/config/env.validation';
import { ConsumedMessage, ConsumeOutcome, QueueService } from '@platform/queue/queue.service';
import { QUEUES } from '@platform/queue/topology';
import { jobEventSchema } from './contracts';
import { JobsService } from './jobs.service';

/** Consumes q.api.job-events: validates each event and applies it to the job. */
@Injectable()
export class JobEventsConsumer implements OnApplicationBootstrap {
  private readonly logger = new Logger(JobEventsConsumer.name);
  private readonly enabled: boolean;

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
  async handle(message: ConsumedMessage): Promise<ConsumeOutcome> {
    const parsed = jobEventSchema.safeParse(message.body);
    if (!parsed.success) {
      this.logger.warn(`Dropping malformed job event (${message.routingKey}): ${parsed.error.message}`);
      return 'reject';
    }
    const event = parsed.data;
    try {
      const job = await this.jobs.applyEvent(event);
      this.logger.debug(
        `${event.event} ${event.jobId}${event.stage ? ` [${event.stage}]` : ''}${
          job ? ` -> ${job.status}` : ' (unknown job)'
        }`,
      );
      return 'ack';
    } catch (error) {
      this.logger.error(
        `Could not apply ${event.event} to job ${event.jobId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 'reject';
    }
  }
}
