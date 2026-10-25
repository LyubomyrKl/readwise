/**
 * RabbitMQ topology (docs/toolbox-architecture-plan.md, 2.9). The API asserts
 * all of it on connect; workers assert their own queue with identical arguments.
 */
export const EXCHANGES = {
  /** job envelopes, routing key jobs.<type> */
  jobs: 'workbench.jobs',
  /** job events from workers, routing key job.<event> */
  events: 'workbench.job-events',
  /** control messages from the API to workers (fanout), e.g. cancel */
  control: 'workbench.job-control',
  /** dead letters of every queue below, routing key = source queue name */
  dlx: 'workbench.dlx',
} as const;

export const QUEUES = {
  nodeDefault: 'q.node.default',
  apiEvents: 'q.api.job-events',
} as const;

export const dlqOf = (queue: string): string => `${queue}.dlq`;
export const jobRoutingKey = (type: string): string => `jobs.${type}`;
export const eventRoutingKey = (event: string): string => `job.${event}`;
export const pythonQueueFor = (toolId: string): string => `q.py.${toolId}`;

/** Job types handled by the Python workers, grouped by their queue. */
export const PYTHON_JOB_TYPES: Record<string, string[]> = {
  reader: ['reader.extract', 'reader.summarize'],
};

/** Queue arguments every work queue is declared with (must match on both sides). */
export const workQueueArguments = (queue: string): Record<string, unknown> => ({
  'x-dead-letter-exchange': EXCHANGES.dlx,
  'x-dead-letter-routing-key': queue,
});

/** Pre-Phase-4 queues; deleted on connect, nothing consumes them any more. */
export const LEGACY_QUEUES = ['extract_request', 'summary_request'];
